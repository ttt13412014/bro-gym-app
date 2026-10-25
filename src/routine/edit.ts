// Edición de rutinas del usuario y mesociclos. Todo local (PowerSync), funciona sin señal.
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import { currentUserId, nowIso } from '@/workout/data';

type DB = AbstractPowerSyncDatabase;

// ----------------------------------------------------------------- rutina
export async function renameRoutine(db: DB, routineId: string, name: string) {
  const ts = nowIso();
  await db.execute('UPDATE user_routines SET name = ?, updated_at = ? WHERE id = ?', [name.trim().slice(0, 60), ts, routineId]);
}

export async function setActiveRoutine(db: DB, routineId: string) {
  const userId = await currentUserId(db);
  const ts = nowIso();
  await db.writeTransaction(async (tx) => {
    await tx.execute('UPDATE user_routines SET is_active = 0, updated_at = ? WHERE user_id = ? AND is_active = 1 AND id != ?', [ts, userId, routineId]);
    await tx.execute('UPDATE user_routines SET is_active = 1, updated_at = ? WHERE id = ?', [ts, routineId]);
  });
}

// Borrado lógico: el historial de sesiones queda (las series apuntan a los bloques)
export async function deleteRoutine(db: DB, routineId: string) {
  const ts = nowIso();
  await db.writeTransaction(async (tx) => {
    await tx.execute('UPDATE user_routines SET deleted_at = ?, is_active = 0, updated_at = ? WHERE id = ?', [ts, ts, routineId]);
    await tx.execute(`UPDATE plans SET status = 'terminado', updated_at = ? WHERE routine_id = ? AND status = 'activo'`, [ts, routineId]);
  });
}

// ----------------------------------------------------------------- días
export async function addDay(db: DB, routineId: string, name: string) {
  const userId = await currentUserId(db);
  const ts = nowIso();
  const { n } = await db.get<{ n: number | null }>(
    'SELECT max(day_index) AS n FROM user_routine_days WHERE routine_id = ? AND deleted_at IS NULL', [routineId],
  );
  const { id } = await db.get<{ id: string }>('SELECT uuid() AS id');
  await db.execute(
    `INSERT INTO user_routine_days (id, user_id, routine_id, day_index, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, routineId, (n ?? 0) + 1, name.trim().slice(0, 40) || `Día ${(n ?? 0) + 1}`, ts, ts],
  );
  return id;
}

export async function renameDay(db: DB, dayId: string, name: string) {
  await db.execute('UPDATE user_routine_days SET name = ?, updated_at = ? WHERE id = ?', [name.trim().slice(0, 40), nowIso(), dayId]);
}

export async function deleteDay(db: DB, dayId: string) {
  const ts = nowIso();
  await db.writeTransaction(async (tx) => {
    const d = await tx.get<{ routine_id: string }>('SELECT routine_id FROM user_routine_days WHERE id = ?', [dayId]);
    await tx.execute('UPDATE user_routine_days SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, dayId]);
    await tx.execute('UPDATE user_routine_blocks SET deleted_at = ?, updated_at = ? WHERE routine_day_id = ? AND deleted_at IS NULL', [ts, ts, dayId]);
    await renumberDays(tx, d.routine_id, ts);
  });
}

export async function moveDay(db: DB, dayId: string, dir: -1 | 1) {
  const ts = nowIso();
  await db.writeTransaction(async (tx) => {
    const d = await tx.get<{ routine_id: string; day_index: number }>('SELECT routine_id, day_index FROM user_routine_days WHERE id = ?', [dayId]);
    const other = await tx.getOptional<{ id: string; day_index: number }>(
      `SELECT id, day_index FROM user_routine_days WHERE routine_id = ? AND deleted_at IS NULL
         AND day_index ${dir < 0 ? '<' : '>'} ? ORDER BY day_index ${dir < 0 ? 'DESC' : 'ASC'} LIMIT 1`,
      [d.routine_id, d.day_index],
    );
    if (!other) return;
    await tx.execute('UPDATE user_routine_days SET day_index = ?, updated_at = ? WHERE id = ?', [other.day_index, ts, dayId]);
    await tx.execute('UPDATE user_routine_days SET day_index = ?, updated_at = ? WHERE id = ?', [d.day_index, ts, other.id]);
  });
}

type Ctx = Pick<DB, 'execute' | 'getAll'>;
async function renumberDays(tx: Ctx, routineId: string, ts: string) {
  const days = await tx.getAll<{ id: string; day_index: number }>(
    'SELECT id, day_index FROM user_routine_days WHERE routine_id = ? AND deleted_at IS NULL ORDER BY day_index', [routineId],
  );
  for (const [i, d] of days.entries()) {
    if (d.day_index !== i + 1) await tx.execute('UPDATE user_routine_days SET day_index = ?, updated_at = ? WHERE id = ?', [i + 1, ts, d.id]);
  }
}

// ----------------------------------------------------------------- bloques
export type BlockPatch = Partial<{
  sets: number; reps_min: number; reps_max: number; rep_unit: 'reps' | 'sec'; rest_sec: number;
  tempo: string | null; intensity: unknown; technique_id: string | null; technique_params: unknown;
  group_key: string | null; progression: unknown; notes: string | null;
}>;

const JSON_KEYS = new Set(['intensity', 'technique_params', 'progression']);

export function validatePatch(p: BlockPatch & { reps_min?: number; reps_max?: number }) {
  if (p.sets != null && (p.sets < 1 || p.sets > 20)) return 'Series: entre 1 y 20';
  if (p.reps_min != null && p.reps_min < 1) return 'Reps: mínimo 1';
  if (p.reps_min != null && p.reps_max != null && p.reps_max < p.reps_min) return 'El máximo de reps no puede ser menor al mínimo';
  if (p.rest_sec != null && (p.rest_sec < 0 || p.rest_sec > 900)) return 'Descanso: entre 0 y 15 min';
  return null;
}

export async function updateBlock(db: DB, blockId: string, patch: BlockPatch) {
  const keys = Object.keys(patch) as (keyof BlockPatch)[];
  if (!keys.length) return;
  const err = validatePatch(patch);
  if (err) throw new Error(err);
  const vals = keys.map((k) => {
    const v = patch[k];
    return JSON_KEYS.has(k) ? (v == null ? null : JSON.stringify(v)) : v;
  });
  await db.execute(
    `UPDATE user_routine_blocks SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    [...vals, nowIso(), blockId],
  );
}

export async function addBlock(db: DB, dayId: string, exerciseId: string, opts?: { compound?: boolean }) {
  const userId = await currentUserId(db);
  const ts = nowIso();
  const { n } = await db.get<{ n: number | null }>(
    'SELECT max(position) AS n FROM user_routine_blocks WHERE routine_day_id = ? AND deleted_at IS NULL', [dayId],
  );
  const { id } = await db.get<{ id: string }>('SELECT uuid() AS id');
  const compound = opts?.compound ?? false;
  await db.execute(
    `INSERT INTO user_routine_blocks (id, user_id, routine_day_id, position, exercise_id, set_type, sets, reps_min, reps_max,
       rep_unit, rest_sec, intensity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'working', 3, ?, ?, 'reps', ?, '{"type":"rir","value":2}', ?, ?)`,
    [id, userId, dayId, (n ?? 0) + 1, exerciseId, compound ? 6 : 10, compound ? 10 : 15, compound ? 120 : 75, ts, ts],
  );
  return id;
}

// Cambiar el ejercicio reinicia la progresión del bloque (el peso de otro ejercicio no sirve)
export async function replaceExercise(db: DB, blockId: string, exerciseId: string) {
  const ts = nowIso();
  await db.writeTransaction(async (tx) => {
    const b = await tx.get<{ intensity: string }>('SELECT intensity FROM user_routine_blocks WHERE id = ?', [blockId]);
    // % de 1RM / TM del ejercicio anterior no aplica al nuevo: pasa a RIR
    let intensity = b.intensity;
    try {
      const t = (JSON.parse(b.intensity) as { type?: string }).type;
      if (t === 'pct_1rm' || t === 'pct_tm') intensity = '{"type":"rir","value":2}';
    } catch { /* se deja */ }
    await tx.execute(
      `UPDATE user_routine_blocks SET exercise_id = ?, intensity = ?, source_block_id = NULL, updated_at = ? WHERE id = ?`,
      [exerciseId, intensity, ts, blockId],
    );
    await tx.execute('DELETE FROM user_progression_state WHERE routine_block_id = ?', [blockId]);
  });
}

export async function resetProgression(db: DB, blockId: string) {
  await db.execute('DELETE FROM user_progression_state WHERE routine_block_id = ?', [blockId]);
}

export async function deleteBlock(db: DB, blockId: string) {
  const ts = nowIso();
  await db.writeTransaction(async (tx) => {
    const b = await tx.get<{ routine_day_id: string }>('SELECT routine_day_id FROM user_routine_blocks WHERE id = ?', [blockId]);
    await tx.execute('UPDATE user_routine_blocks SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, blockId]);
    await renumberBlocks(tx, b.routine_day_id, ts);
  });
}

export async function duplicateBlock(db: DB, blockId: string) {
  const ts = nowIso();
  await db.writeTransaction(async (tx) => {
    const b = await tx.get<{ routine_day_id: string; position: number }>('SELECT routine_day_id, position FROM user_routine_blocks WHERE id = ?', [blockId]);
    // hace lugar debajo
    await tx.execute(
      `UPDATE user_routine_blocks SET position = position + 1, updated_at = ?
       WHERE routine_day_id = ? AND deleted_at IS NULL AND position > ?`, [ts, b.routine_day_id, b.position],
    );
    await tx.execute(
      `INSERT INTO user_routine_blocks (id, user_id, routine_day_id, source_block_id, position, exercise_id, set_type, sets,
         reps_min, reps_max, rep_unit, rest_sec, tempo, intensity, technique_id, technique_params, group_key, progression,
         notes, created_at, updated_at)
       SELECT uuid(), user_id, routine_day_id, NULL, position + 1, exercise_id, set_type, sets, reps_min, reps_max, rep_unit,
         rest_sec, tempo, intensity, technique_id, technique_params, group_key, progression, notes, ?, ?
       FROM user_routine_blocks WHERE id = ?`, [ts, ts, blockId],
    );
  });
}

export async function moveBlock(db: DB, blockId: string, dir: -1 | 1) {
  const ts = nowIso();
  await db.writeTransaction(async (tx) => {
    const b = await tx.get<{ routine_day_id: string; position: number }>('SELECT routine_day_id, position FROM user_routine_blocks WHERE id = ?', [blockId]);
    const other = await tx.getOptional<{ id: string; position: number }>(
      `SELECT id, position FROM user_routine_blocks WHERE routine_day_id = ? AND deleted_at IS NULL
         AND position ${dir < 0 ? '<' : '>'} ? ORDER BY position ${dir < 0 ? 'DESC' : 'ASC'} LIMIT 1`,
      [b.routine_day_id, b.position],
    );
    if (!other) return;
    await tx.execute('UPDATE user_routine_blocks SET position = ?, updated_at = ? WHERE id = ?', [other.position, ts, blockId]);
    await tx.execute('UPDATE user_routine_blocks SET position = ?, updated_at = ? WHERE id = ?', [b.position, ts, other.id]);
  });
}

async function renumberBlocks(tx: Ctx, dayId: string, ts: string) {
  const blocks = await tx.getAll<{ id: string; position: number }>(
    'SELECT id, position FROM user_routine_blocks WHERE routine_day_id = ? AND deleted_at IS NULL ORDER BY position', [dayId],
  );
  for (const [i, b] of blocks.entries()) {
    if (b.position !== i + 1) await tx.execute('UPDATE user_routine_blocks SET position = ?, updated_at = ? WHERE id = ?', [i + 1, ts, b.id]);
  }
}

// ----------------------------------------------------------------- mesociclos
export type WeekKind = 'acumulacion' | 'intensificacion' | 'deload' | 'test';

// Multiplicadores por tipo de semana (los usa el motor al prescribir)
export const WEEK_PRESET: Record<WeekKind, { label: string; volume_mult: number; intensity_mult: number; rir_offset: number; hint: string }> = {
  acumulacion: { label: 'Acumulación', volume_mult: 1, intensity_mult: 1, rir_offset: 0, hint: 'Volumen normal' },
  intensificacion: { label: 'Intensificación', volume_mult: 0.85, intensity_mult: 1.025, rir_offset: -1, hint: '−15% series, +2,5% peso, 1 RIR menos' },
  deload: { label: 'Descarga', volume_mult: 0.5, intensity_mult: 0.9, rir_offset: 2, hint: 'Mitad de series, −10% peso, 2 RIR más' },
  test: { label: 'Test', volume_mult: 0.5, intensity_mult: 1, rir_offset: 0, hint: 'Poco volumen para probar 1RM' },
};

export type PlanTemplate = 'lineal' | 'ondulado' | 'sin_descarga';
export function planWeeks(weeks: number, template: PlanTemplate): WeekKind[] {
  if (template === 'sin_descarga') return Array.from({ length: weeks }, () => 'acumulacion');
  if (template === 'ondulado') {
    // acumulación / intensificación alternadas y descarga al final
    return Array.from({ length: weeks }, (_, i) => (i === weeks - 1 ? 'deload' : i % 2 === 0 ? 'acumulacion' : 'intensificacion'));
  }
  // lineal: acumulación, la anteúltima de intensificación (si hay 4+) y descarga al final
  return Array.from({ length: weeks }, (_, i) =>
    i === weeks - 1 ? 'deload' : weeks >= 4 && i === weeks - 2 ? 'intensificacion' : 'acumulacion');
}

export async function createPlan(db: DB, p: { routineId: string; name: string; startDate: string; weeks: WeekKind[] }) {
  const userId = await currentUserId(db);
  const ts = nowIso();
  return db.writeTransaction(async (tx) => {
    // un solo mesociclo activo por rutina
    await tx.execute(`UPDATE plans SET status = 'terminado', updated_at = ? WHERE routine_id = ? AND status = 'activo'`, [ts, p.routineId]);
    const { id } = await tx.get<{ id: string }>('SELECT uuid() AS id');
    await tx.execute(
      `INSERT INTO plans (id, user_id, routine_id, name, start_date, weeks, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'activo', ?, ?)`,
      [id, userId, p.routineId, p.name.trim().slice(0, 60) || 'Mesociclo', p.startDate, p.weeks.length, ts, ts],
    );
    for (const [i, kind] of p.weeks.entries()) {
      const w = WEEK_PRESET[kind];
      await tx.execute(
        `INSERT INTO plan_weeks (id, user_id, plan_id, week_index, kind, volume_mult, intensity_mult, rir_offset, updated_at)
         VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, id, i + 1, kind, w.volume_mult, w.intensity_mult, w.rir_offset, ts],
      );
    }
    return id;
  });
}

export async function endPlan(db: DB, planId: string) {
  await db.execute(`UPDATE plans SET status = 'terminado', updated_at = ? WHERE id = ?`, [nowIso(), planId]);
}

// Semana actual del plan (1-based) o null si todavía no empezó / ya terminó
export function weekOf(startDate: string, weeks: number, today = new Date()) {
  const [y, m, d] = startDate.split('-').map(Number);
  const start = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const w = Math.floor((t.getTime() - start.getTime()) / (7 * 86_400_000)) + 1;
  return w >= 1 && w <= weeks ? w : null;
}
