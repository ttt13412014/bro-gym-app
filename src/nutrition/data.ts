// Datos de nutrición contra SQLite local
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import { ageFrom, computeTargets, fitMacros, kcalFloor, localIso, mondayOf, portion, weeklyCheck, type Sex } from '@/lib/nutrition';
import type { OffFood } from '@/lib/off';
import { currentUserId, nowIso } from '@/workout/data';

type DB = AbstractPowerSyncDatabase;

export type Meal = 'desayuno' | 'almuerzo' | 'merienda' | 'cena' | 'snack';
export const MEALS: { value: Meal; label: string }[] = [
  { value: 'desayuno', label: 'Desayuno' }, { value: 'almuerzo', label: 'Almuerzo' },
  { value: 'merienda', label: 'Merienda' }, { value: 'cena', label: 'Cena' }, { value: 'snack', label: 'Colación' },
];

export type FoodRow = {
  id: string; source: string; barcode: string | null; name: string; brand: string | null;
  kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number; fiber_100g: number | null;
  serving_g: number | null; serving_label: string | null; image_url: string | null; is_favorite: number;
};

export type Profile = {
  user_id: string; sex: Sex; birth_date: string; height_cm: number; activity_factor: number; goal: string;
  rate_kg_week: number; protein_g_kg: number; fat_pct_kcal: number; auto_adjust: number;
};

export const today = () => localIso(new Date());

// ----------------------------------------------------------------- alimentos
export async function findFoodByBarcode(db: DB, barcode: string) {
  return db.getOptional<FoodRow>(
    'SELECT * FROM foods WHERE barcode = ? AND deleted_at IS NULL LIMIT 1', [barcode],
  );
}

// Guarda en el cache local un alimento de Open Food Facts (o devuelve el que ya estaba)
export async function upsertOffFood(db: DB, f: OffFood): Promise<string> {
  const existing = await findFoodByBarcode(db, f.barcode);
  if (existing) return existing.id;
  const userId = await currentUserId(db);
  const ts = nowIso();
  const { id } = await db.get<{ id: string }>('SELECT uuid() AS id');
  await db.execute(
    `INSERT INTO foods (id, owner_id, source, barcode, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g,
       fiber_100g, serving_g, serving_label, image_url, off_updated_at, is_favorite, created_at, updated_at)
     VALUES (?, ?, 'off', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, userId, f.barcode, f.name, f.brand, f.kcal_100g, f.protein_100g, f.carbs_100g, f.fat_100g,
      f.fiber_100g, f.serving_g, f.serving_label, f.image_url, ts, ts, ts],
  );
  return id;
}

export async function createCustomFood(db: DB, f: {
  name: string; brand: string | null; barcode: string | null; kcal_100g: number; protein_100g: number;
  carbs_100g: number; fat_100g: number; serving_g: number | null; serving_label: string | null;
}) {
  const userId = await currentUserId(db);
  const ts = nowIso();
  const { id } = await db.get<{ id: string }>('SELECT uuid() AS id');
  await db.execute(
    `INSERT INTO foods (id, owner_id, source, barcode, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g,
       serving_g, serving_label, is_favorite, created_at, updated_at)
     VALUES (?, ?, 'custom', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, userId, f.barcode, f.name, f.brand, f.kcal_100g, f.protein_100g, f.carbs_100g, f.fat_100g,
      f.serving_g, f.serving_label, ts, ts],
  );
  return id;
}

export async function toggleFavorite(db: DB, foodId: string, fav: boolean) {
  await db.execute('UPDATE foods SET is_favorite = ?, updated_at = ? WHERE id = ?', [fav ? 1 : 0, nowIso(), foodId]);
}

// ----------------------------------------------------------------- registro
export async function logFood(db: DB, food: FoodRow, grams: number, meal: Meal, date = today()) {
  const userId = await currentUserId(db);
  const ts = nowIso();
  const m = portion(food, grams);
  await db.execute(
    `INSERT INTO food_logs (id, user_id, log_date, meal, food_id, food_name, grams, kcal, protein_g, carbs_g, fat_g,
       logged_at, created_at, updated_at)
     VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, date, meal, food.id, food.brand ? `${food.name} · ${food.brand}` : food.name, grams,
      m.kcal, m.protein_g, m.carbs_g, m.fat_g, ts, ts, ts],
  );
}

export async function deleteLog(db: DB, id: string) {
  const ts = nowIso();
  await db.execute('UPDATE food_logs SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, id]);
}

// ----------------------------------------------------------------- peso
export async function latestWeight(db: DB) {
  return (await db.getOptional<{ weight_kg: number }>(
    `SELECT weight_kg FROM body_measurements WHERE weight_kg IS NOT NULL AND deleted_at IS NULL
     ORDER BY measured_at DESC LIMIT 1`,
  ))?.weight_kg ?? null;
}

export async function logWeight(db: DB, kg: number) {
  const userId = await currentUserId(db);
  const ts = nowIso();
  await db.execute(
    `INSERT INTO body_measurements (id, user_id, measured_at, weight_kg, updated_at) VALUES (uuid(), ?, ?, ?, ?)`,
    [userId, ts, kg, ts],
  );
}

// ----------------------------------------------------------------- perfil y objetivo
// Ajuste semanal acumulado del objetivo vigente
export async function accumulatedAdjustment(db: DB) {
  const r = await db.getOptional<{ adjust_kcal: number | null }>(
    'SELECT adjust_kcal FROM nutrition_targets WHERE deleted_at IS NULL ORDER BY valid_from DESC, created_at DESC LIMIT 1',
  );
  return r?.adjust_kcal ?? 0;
}

export async function saveProfileAndTarget(
  db: DB, p: Omit<Profile, 'user_id'>, weightKg: number, reason: 'inicial' | 'manual', keepAdjustKcal = 0,
) {
  const userId = await currentUserId(db);
  const ts = nowIso();
  const t = computeTargets({
    sex: p.sex, weightKg, heightCm: p.height_cm, age: ageFrom(p.birth_date), activity: p.activity_factor,
    rateKgWeek: p.rate_kg_week, proteinGKg: p.protein_g_kg, fatPct: p.fat_pct_kcal, adjustKcal: keepAdjustKcal,
  });
  await db.writeTransaction(async (tx) => {
    const exists = await tx.getOptional<{ id: string }>('SELECT id FROM nutrition_profiles WHERE id = ?', [userId]);
    const vals = [p.sex, p.birth_date, p.height_cm, p.activity_factor, p.goal, p.rate_kg_week, p.protein_g_kg,
      p.fat_pct_kcal, p.auto_adjust, ts];
    if (exists) {
      await tx.execute(
        `UPDATE nutrition_profiles SET sex = ?, birth_date = ?, height_cm = ?, activity_factor = ?, goal = ?,
           rate_kg_week = ?, protein_g_kg = ?, fat_pct_kcal = ?, auto_adjust = ?, updated_at = ? WHERE id = ?`,
        [...vals, userId],
      );
    } else {
      await tx.execute(
        `INSERT INTO nutrition_profiles (id, user_id, sex, birth_date, height_cm, activity_factor, goal,
           rate_kg_week, protein_g_kg, fat_pct_kcal, auto_adjust, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, userId, ...vals],
      );
    }
    // lo que el piso no dejó aplicar del ajuste no se arrastra
    const base = computeTargets({
      sex: p.sex, weightKg, heightCm: p.height_cm, age: ageFrom(p.birth_date), activity: p.activity_factor,
      rateKgWeek: p.rate_kg_week, proteinGKg: p.protein_g_kg, fatPct: p.fat_pct_kcal,
    }).kcal;
    await tx.execute(
      `INSERT INTO nutrition_targets (id, user_id, valid_from, bmr, tdee, kcal, protein_g, carbs_g, fat_g, reason,
         adjust_kcal, created_at, updated_at)
       VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, today(), t.bmr, t.tdee, t.kcal, t.protein_g, t.carbs_g, t.fat_g, reason, t.kcal - base, ts, ts],
    );
  });
  return t;
}

// ----------------------------------------------------------------- semana
// Evalúa la semana anterior completa (lunes a domingo). Devuelve null si ya hay check-in.
export async function evaluateLastWeek(db: DB) {
  const weekStart = mondayOf(new Date(Date.now() - 7 * 86_400_000));
  const done = await db.getOptional<{ id: string; applied: number; adjustment_kcal: number }>(
    'SELECT id, applied, adjustment_kcal FROM weekly_checkins WHERE week_start = ? AND deleted_at IS NULL', [weekStart],
  );
  const profile = await db.getOptional<Profile>('SELECT * FROM nutrition_profiles LIMIT 1');
  if (!profile) return null;

  const from = mondayOf(new Date(Date.now() - 14 * 86_400_000));
  const [weights, logs] = await Promise.all([
    db.getAll<{ date: string; kg: number }>(
      // measured_at es UTC: se pasa a fecha local del celular (un pesaje de las 22 h no cae al día siguiente)
      `SELECT date(measured_at, 'localtime') AS date, weight_kg AS kg FROM body_measurements
       WHERE weight_kg IS NOT NULL AND deleted_at IS NULL AND date(measured_at, 'localtime') >= ?`,
      [from],
    ),
    db.get<{ days: number; avg: number | null }>(
      `SELECT count(*) AS days, avg(k) AS avg FROM
         (SELECT log_date, sum(kcal) AS k FROM food_logs
          WHERE deleted_at IS NULL AND log_date >= ? AND log_date < date(?, '+7 days') GROUP BY log_date)`,
      [weekStart, weekStart],
    ),
  ]);
  const res = weeklyCheck({
    weights, weekStart, daysLogged: logs.days, avgKcalLogged: logs.avg, targetRateKgWeek: profile.rate_kg_week,
  });
  return { weekStart, profile, res, existing: done, daysLogged: logs.days, avgKcal: logs.avg };
}

// Guarda el check-in y, si se aplica, crea el objetivo nuevo con el ajuste acumulado
export type CheckinOutcome = { applied: boolean; note: string | null };

export async function applyCheckin(
  db: DB, ev: NonNullable<Awaited<ReturnType<typeof evaluateLastWeek>>>, apply: boolean,
): Promise<CheckinOutcome> {
  if (ev.existing) return { applied: false, note: null }; // una revisión por semana (unique user_id + week_start)
  const userId = await currentUserId(db);
  const ts = nowIso();
  const cur = await db.getOptional<{ kcal: number; protein_g: number; fat_g: number; bmr: number; tdee: number; adjust_kcal: number | null }>(
    'SELECT kcal, protein_g, fat_g, bmr, tdee, adjust_kcal FROM nutrition_targets WHERE deleted_at IS NULL ORDER BY valid_from DESC, created_at DESC LIMIT 1',
  );

  // qué objetivo quedaría (antes de escribir, para que applied diga la verdad)
  let next: { kcal: number; protein: number; carbs: number; fat: number } | null = null;
  let note: string | null = null;
  if (apply && cur && ev.res.adjustmentKcal !== 0) {
    const floor = kcalFloor(ev.profile.sex, cur.tdee);
    const kcal = Math.max(floor, cur.kcal + ev.res.adjustmentKcal);
    if (kcal === cur.kcal) {
      note = `Ya estás en el mínimo de ${floor} kcal: no bajo más. Para seguir bajando, sumá actividad (pasos o cardio).`;
    } else {
      if (kcal === floor && cur.kcal + ev.res.adjustmentKcal < floor) note = `Bajé hasta el mínimo de ${floor} kcal.`;
      const fit = fitMacros(kcal, cur.protein_g, cur.fat_g); // se mueven carbos; si no cierra, baja proteína
      if (fit.note) note = note ? `${note} ${fit.note}` : fit.note;
      next = { kcal, protein: fit.protein, carbs: fit.carbs, fat: fit.fat };
    }
  }
  const applied = next != null;

  let wrote = false;
  await db.writeTransaction(async (tx) => {
    // re-chequeo adentro de la transacción: dos llamadas casi juntas no duplican el check-in ni el objetivo
    const dup = await tx.getOptional<{ id: string }>(
      'SELECT id FROM weekly_checkins WHERE week_start = ? AND deleted_at IS NULL', [ev.weekStart],
    );
    if (dup) return;
    wrote = true;
    const { id: checkinId } = await tx.get<{ id: string }>('SELECT uuid() AS id');
    await tx.execute(
      `INSERT INTO weekly_checkins (id, user_id, week_start, avg_weight_kg, change_kg, target_change_kg,
         avg_kcal_logged, days_logged, adherence_pct, adjustment_kcal, applied, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [checkinId, userId, ev.weekStart, ev.res.avgWeight, ev.res.changeKg, ev.profile.rate_kg_week,
        ev.avgKcal == null ? null : Math.round(ev.avgKcal), ev.daysLogged, ev.res.adherencePct,
        applied && cur && next ? next.kcal - cur.kcal : ev.res.adjustmentKcal, applied ? 1 : 0, ts, ts],
    );
    if (next && cur) {
      await tx.execute(
        `INSERT INTO nutrition_targets (id, user_id, valid_from, bmr, tdee, kcal, protein_g, carbs_g, fat_g, reason,
           checkin_id, adjust_kcal, created_at, updated_at)
         VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, 'ajuste_semanal', ?, ?, ?, ?)`,
        [userId, today(), cur.bmr, cur.tdee, next.kcal, next.protein, next.carbs, next.fat, checkinId,
          (cur.adjust_kcal ?? 0) + (next.kcal - cur.kcal), ts, ts],
      );
    }
  });
  return { applied: wrote && applied, note: wrote ? note : null };
}
