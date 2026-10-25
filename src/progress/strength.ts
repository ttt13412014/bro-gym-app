// Recalcula los niveles del usuario y los guarda (user_strength_levels + nivel general en user_settings)
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import { LIFTS, evaluateStrength, type Level, type Lift, type Standard, type StrengthResult } from '@/lib/strength';
import { currentUserId, nowIso } from '@/workout/data';
import { E1RM_SQL, E1RM_WHERE } from '@/lib/e1rm';

type DB = AbstractPowerSyncDatabase;

export type StrengthStatus =
  | { ok: true; result: StrengthResult; bodyweightKg: number; changed: boolean }
  | { ok: false; missing: ('sexo' | 'altura' | 'peso')[] };

const BEST_E1RM_SQL = `
  SELECT max(v) AS v FROM (
    SELECT max(${E1RM_SQL()}) AS v
    FROM workout_sets
    WHERE exercise_id = ? AND ${E1RM_WHERE()} AND completed_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-180 days')
    UNION ALL
    SELECT max(one_rm_kg) FROM user_exercise_maxes
    WHERE exercise_id = ? AND deleted_at IS NULL AND source IN ('test', 'manual')
      AND measured_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-180 days')
  )`;

export async function recomputeStrength(db: DB): Promise<StrengthStatus> {
  const [profile, weight, standards, levels] = await Promise.all([
    db.getOptional<{ sex: Standard['sex'] | null; height_cm: number | null }>('SELECT sex, height_cm FROM nutrition_profiles LIMIT 1'),
    db.getOptional<{ kg: number }>(
      `SELECT weight_kg AS kg FROM body_measurements WHERE weight_kg IS NOT NULL AND deleted_at IS NULL
       ORDER BY measured_at DESC LIMIT 1`,
    ),
    db.getAll<Standard & { exercise_id: string }>('SELECT * FROM strength_standards'),
    db.getAll<Level>('SELECT slug, rank, name, icon, uses_accent FROM strength_levels ORDER BY rank'),
  ]);
  const missing: ('sexo' | 'altura' | 'peso')[] = [];
  if (!profile?.sex) missing.push('sexo');
  if (!profile?.height_cm) missing.push('altura');
  if (!weight?.kg) missing.push('peso');
  if (missing.length || !profile?.sex || !profile.height_cm || !weight) return { ok: false, missing };

  // ejercicio de cada lift según la tabla de estándares
  const exByLift = new Map<Lift, string>();
  for (const s of standards) exByLift.set(s.lift, s.exercise_id);
  const best: Partial<Record<Lift, number | null>> = {};
  for (const lift of LIFTS) {
    const ex = exByLift.get(lift);
    best[lift] = ex ? (await db.get<{ v: number | null }>(BEST_E1RM_SQL, [ex, ex])).v : null;
  }

  const result = evaluateStrength({
    standards, levels, sex: profile.sex, heightCm: profile.height_cm, bodyweightKg: weight.kg, best,
  });

  const userId = await currentUserId(db);
  const ts = nowIso();
  let changed = false;
  await db.writeTransaction(async (tx) => {
    const rows = [
      ...result.lifts.map((l) => ({
        lift: l.lift as string, level: l.level.slug, best: l.best == null ? null : Math.round(l.best * 10) / 10,
        ratio: l.ratio, next: l.next?.slug ?? null, kg: l.kgToNext,
      })),
      {
        lift: 'general', level: result.general.level.slug, best: null, ratio: null,
        next: result.general.next?.slug ?? null, kg: result.general.kgToNext,
      },
    ];
    for (const r of rows) {
      const ex = await tx.getOptional<{
        id: string; level_slug: string; best_e1rm_kg: number | null; bodyweight_kg: number | null;
        ratio: number | null; next_level_slug: string | null; kg_to_next: number | null;
      }>(
        `SELECT id, level_slug, best_e1rm_kg, bodyweight_kg, ratio, next_level_slug, kg_to_next
         FROM user_strength_levels WHERE lift = ? AND deleted_at IS NULL`, [r.lift],
      );
      // sin cambios no se escribe: cada UPDATE es una operación que sube a Supabase
      const same = (a: number | null | undefined, b: number | null) =>
        (a ?? null) === b || (a != null && b != null && Math.abs(a - b) < 0.05);
      if (ex && ex.level_slug === r.level && same(ex.best_e1rm_kg, r.best) && same(ex.bodyweight_kg, weight.kg)
        && same(ex.ratio, r.ratio) && (ex.next_level_slug ?? null) === r.next && same(ex.kg_to_next, r.kg)) {
        continue;
      }
      const vals = [r.level, r.best, weight.kg, r.ratio, r.next, r.kg, ts, ts];
      if (ex) {
        await tx.execute(
          `UPDATE user_strength_levels SET level_slug = ?, best_e1rm_kg = ?, bodyweight_kg = ?, ratio = ?,
             next_level_slug = ?, kg_to_next = ?, computed_at = ?, updated_at = ? WHERE id = ?`,
          [...vals, ex.id],
        );
      } else {
        await tx.execute(
          `INSERT INTO user_strength_levels (id, user_id, lift, level_slug, best_e1rm_kg, bodyweight_kg, ratio,
             next_level_slug, kg_to_next, computed_at, updated_at)
           VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, r.lift, ...vals],
        );
      }
    }

    // El ícono cambia solo si cambia el nivel general
    const st = await tx.getOptional<{ strength_level: string | null }>('SELECT strength_level FROM user_settings WHERE id = ?', [userId]);
    const lvl = result.general.level.slug;
    if (!st) {
      await tx.execute(
        `INSERT INTO user_settings (id, user_id, weight_unit, increment_kg, increment_db_kg, equipment, injured_joints,
           strength_level, strength_level_since, updated_at) VALUES (?, ?, 'kg', 2.5, 2, '[]', '[]', ?, ?, ?)`,
        [userId, userId, lvl, ts, ts],
      );
      changed = true;
    } else if (st.strength_level !== lvl) {
      await tx.execute(
        'UPDATE user_settings SET strength_level = ?, strength_level_since = ?, updated_at = ? WHERE id = ?',
        [lvl, ts, ts, userId],
      );
      changed = true;
    }
  });

  return { ok: true, result, bodyweightKg: weight.kg, changed };
}
