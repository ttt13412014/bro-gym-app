// Acceso a datos de entrenamiento (todo contra SQLite local: funciona sin señal)
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import {
  computeNext, type Maxes, type PlanWeek, type SetLog, type State, type Result,
} from '@/lib/progression';
import { currentUserId } from '@/lib/userId';
import { E1RM_SQL, E1RM_WHERE, setE1rmOf } from '@/lib/e1rm';
import { detectRecords, todayWeights, type HistAgg, type RSet } from '@/lib/records';

type DB = AbstractPowerSyncDatabase;

export const nowIso = () => new Date().toISOString();

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

export async function newId(db: DB) {
  return (await db.get<{ id: string }>('SELECT uuid() AS id')).id;
}

export { currentUserId } from '@/lib/userId';

// ----------------------------------------------------------------- tipos
export type BlockRow = {
  id: string; routine_day_id: string; position: number; exercise_id: string; set_type: string;
  sets: number; reps_min: number; reps_max: number; rep_unit: 'reps' | 'sec'; rest_sec: number;
  tempo: string | null; intensity: string; technique_params: string | null; group_key: string | null;
  progression: string | null; notes: string | null;
  exercise_name: string; equipment: string | null; technique_slug: string | null;
  exercise_name_en?: string | null; exercise_category?: string | null; exercise_force?: string | null; // para saber si la cámara lo cuenta
  images: string | null; instructions: string | null; // JSON (fotos relativas / pasos) para mostrar cómo se hace
};

export type SetRow = {
  id: string; routine_block_id: string | null; exercise_id: string; set_index: number;
  set_type: string; parent_set_id: string | null; weight_kg: number | null; reps: number | null;
  rir: number | null; rpe: number | null; rep_unit: string; completed_at: string;
  rest_sec_actual: number | null;
};

export type SessionRow = {
  id: string; routine_id: string | null; routine_day_id: string | null; plan_week_id: string | null;
  started_at: string; ended_at: string | null;
};

export const BLOCKS_SQL = `
  SELECT b.*, e.name_es AS exercise_name, e.name AS exercise_name_en, e.category AS exercise_category, e.force AS exercise_force, e.equipment, e.images, e.instructions, t.slug AS technique_slug
  FROM user_routine_blocks b
  JOIN exercises e ON e.id = b.exercise_id
  LEFT JOIN techniques t ON t.id = b.technique_id
  WHERE b.routine_day_id = ? AND b.deleted_at IS NULL
  ORDER BY b.position`;

export const SETS_SQL = `
  SELECT * FROM workout_sets
  WHERE session_id = ? AND deleted_at IS NULL
  ORDER BY completed_at, set_index`;

// Series que cuentan como "serie del bloque" (las hijas de drop/rest-pause/myo no)
export const isMainSet = (s: SetRow) => s.parent_set_id == null && s.set_type !== 'warmup';

// ----------------------------------------------------------------- rutina / sesión
export async function activeRoutine(db: DB) {
  return db.getOptional<{ id: string; name: string; recovery_days_min: number; progression: string }>(
    `SELECT id, name, recovery_days_min, progression FROM user_routines
     WHERE is_active = 1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
  );
}

export async function currentPlanWeek(db: DB, routineId: string): Promise<(PlanWeek & { id: string }) | null> {
  return db.getOptional(
    `SELECT pw.id, pw.kind, pw.volume_mult, pw.intensity_mult, pw.rir_offset
     FROM plans p JOIN plan_weeks pw ON pw.plan_id = p.id AND pw.deleted_at IS NULL
     WHERE p.routine_id = ? AND p.status = 'activo' AND p.deleted_at IS NULL
       -- semana según la fecha local del celular (start_date es una fecha local)
       AND pw.week_index = CAST((julianday(date('now', 'localtime')) - julianday(p.start_date)) / 7 AS INTEGER) + 1
     LIMIT 1`,
    [routineId],
  );
}

export async function startSession(db: DB, routineId: string, dayId: string) {
  const [userId, id, pw] = await Promise.all([currentUserId(db), newId(db), currentPlanWeek(db, routineId)]);
  const ts = nowIso();
  await db.execute(
    `INSERT INTO workout_sessions (id, user_id, routine_id, routine_day_id, plan_week_id, started_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, routineId, dayId, pw?.id ?? null, ts, ts, ts],
  );
  return id;
}

// ----------------------------------------------------------------- prescripción
type EngineInput = {
  state: State; maxes: Maxes; bestE1rm: number | null; incKg: number; planWeek: PlanWeek;
  routineProgression: unknown;
};

async function engineInputs(db: DB, block: BlockRow, session: SessionRow): Promise<EngineInput> {
  const [st, mx, best, settings, routine, pw] = await Promise.all([
    db.getOptional<State>(
      'SELECT next_weight_kg, next_reps, wave_week, fail_streak FROM user_progression_state WHERE routine_block_id = ?',
      [block.id],
    ),
    db.getOptional<Maxes>(
      `SELECT one_rm_kg, training_max_kg FROM user_exercise_maxes
       WHERE exercise_id = ? AND deleted_at IS NULL ORDER BY measured_at DESC LIMIT 1`,
      [block.exercise_id],
    ),
    // mejor e1RM de los últimos 60 días (Epley ajustado por RIR; e1rm_kg no se replica)
    db.getOptional<{ v: number | null }>(
      `SELECT max(${E1RM_SQL()}) AS v FROM workout_sets
       WHERE exercise_id = ? AND ${E1RM_WHERE()}
         AND completed_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-60 days')`,
      [block.exercise_id],
    ),
    db.getOptional<{ increment_kg: number | null; increment_db_kg: number | null }>(
      'SELECT increment_kg, increment_db_kg FROM user_settings LIMIT 1',
    ),
    session.routine_id
      ? db.getOptional<{ progression: string }>('SELECT progression FROM user_routines WHERE id = ?', [session.routine_id])
      : null,
    session.plan_week_id
      ? db.getOptional<PlanWeek>('SELECT kind, volume_mult, intensity_mult, rir_offset FROM plan_weeks WHERE id = ?', [session.plan_week_id])
      : null,
  ]);
  const dumbbell = block.equipment === 'dumbbell';
  return {
    state: st ?? { next_weight_kg: null, next_reps: null, wave_week: null, fail_streak: 0 },
    maxes: mx ?? { one_rm_kg: null, training_max_kg: null },
    bestE1rm: best?.v ?? null,
    incKg: (dumbbell ? settings?.increment_db_kg : settings?.increment_kg) ?? (dumbbell ? 2 : 2.5),
    planWeek: pw ?? null,
    routineProgression: parseJson(routine?.progression, { kind: 'double', inc_kg: 2.5 }),
  };
}

const toEngineBlock = (b: BlockRow) => ({
  sets: b.sets, reps_min: b.reps_min, reps_max: b.reps_max,
  intensity: parseJson(b.intensity, { type: 'none' }),
  progression: parseJson<unknown>(b.progression, null),
});

const toLog = (s: SetRow): SetLog => ({
  set_type: s.set_type, weight_kg: s.weight_kg, reps: s.reps, rir: s.rir, rpe: s.rpe,
});

// Lo que toca hoy en un bloque (no avanza el estado)
export async function prescribe(db: DB, block: BlockRow, session: SessionRow): Promise<Result['suggestion']> {
  const inp = await engineInputs(db, block, session);
  return computeNext({ block: toEngineBlock(block), lastSets: [], ...inp }).suggestion;
}

// ----------------------------------------------------------------- registro
export async function logSet(db: DB, p: {
  sessionId: string; block: BlockRow; setIndex: number; setType: string; parentSetId?: string | null;
  weightKg: number | null; reps: number; rir: number | null; rpe: number | null;
  target: { weight_kg: number | null; reps: number; rir: number | null } | null;
}) {
  const [userId, id] = await Promise.all([currentUserId(db), newId(db)]);
  // descanso real = segundos desde la serie anterior de la sesión
  const prev = await db.getOptional<{ completed_at: string }>(
    'SELECT completed_at FROM workout_sets WHERE session_id = ? AND deleted_at IS NULL ORDER BY completed_at DESC LIMIT 1',
    [p.sessionId],
  );
  const ts = nowIso();
  const restActual = prev ? Math.round((Date.parse(ts) - Date.parse(prev.completed_at)) / 1000) : null;
  await db.execute(
    `INSERT INTO workout_sets (id, user_id, session_id, exercise_id, routine_block_id, set_index, set_type,
       parent_set_id, weight_kg, reps, rep_unit, rir, rpe, tempo, rest_sec_target, rest_sec_actual, target,
       completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, userId, p.sessionId, p.block.exercise_id, p.block.id, p.setIndex, p.setType,
      p.parentSetId ?? null, p.weightKg, p.reps, p.block.rep_unit, p.rir, p.rpe, p.block.tempo,
      p.block.rest_sec, restActual, p.target ? JSON.stringify(p.target) : null, ts, ts, ts,
    ],
  );
  return id;
}

export async function deleteSet(db: DB, setId: string) {
  const ts = nowIso();
  // borra también la cadena (drops / mini series)
  await db.execute(
    'UPDATE workout_sets SET deleted_at = ?, updated_at = ? WHERE id = ? OR parent_set_id = ?',
    [ts, ts, setId, setId],
  );
}

// ----------------------------------------------------------------- cierre
export type SessionSummary = {
  minutes: number; sets: number; volumeKg: number;
  next: { exercise: string; text: string }[];
  prs: { exercise: string; items: string[] }[];
};

// endedAt: para cerrar una sesión olvidada con la hora de su última serie (si no, ahora)
export async function finishSession(db: DB, session: SessionRow, endedAt?: string): Promise<SessionSummary> {
  if (!session.routine_day_id) throw new Error('Sesión sin día de rutina');
  const [userId, blocks, sets] = await Promise.all([
    currentUserId(db),
    db.getAll<BlockRow>(BLOCKS_SQL, [session.routine_day_id]),
    db.getAll<SetRow>(SETS_SQL, [session.id]),
  ]);
  const ended = endedAt ?? nowIso();
  const next: SessionSummary['next'] = [];

  // Las entradas se leen antes de escribir para que cada bloque vea su estado previo
  const results: { block: BlockRow; res: Result }[] = [];
  for (const block of blocks) {
    // solo series principales: drops / rest-pause / myo romperían hitAll y el AMRAP
    const mine = sets.filter((s) => s.routine_block_id === block.id && isMainSet(s));
    if (!mine.length) continue;
    const inp = await engineInputs(db, block, session);
    results.push({ block, res: computeNext({ block: toEngineBlock(block), lastSets: mine.map(toLog), ...inp }) });
  }

  await db.writeTransaction(async (tx) => {
    await tx.execute('UPDATE workout_sessions SET ended_at = ?, updated_at = ? WHERE id = ?', [ended, ended, session.id]);

    for (const { block, res } of results) {
      const st = res.state;
      const existing = await tx.getOptional<{ id: string }>(
        'SELECT id FROM user_progression_state WHERE routine_block_id = ?', [block.id],
      );
      if (existing) {
        await tx.execute(
          `UPDATE user_progression_state SET next_weight_kg = ?, next_reps = ?, wave_week = ?, fail_streak = ?,
             last_session_id = ?, updated_at = ? WHERE id = ?`,
          [st.next_weight_kg, st.next_reps, st.wave_week, st.fail_streak, session.id, ended, existing.id],
        );
      } else {
        const { id } = await tx.get<{ id: string }>('SELECT uuid() AS id');
        await tx.execute(
          `INSERT INTO user_progression_state (id, user_id, routine_block_id, next_weight_kg, next_reps,
             wave_week, fail_streak, last_session_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, userId, block.id, st.next_weight_kg, st.next_reps, st.wave_week, st.fail_streak, session.id, ended],
        );
      }

      // 5/3/1: nuevo training max al cerrar el ciclo
      if (res.newTrainingMax) {
        const { id } = await tx.get<{ id: string }>('SELECT uuid() AS id');
        await tx.execute(
          `INSERT INTO user_exercise_maxes (id, user_id, exercise_id, training_max_kg, source, measured_at, updated_at)
           VALUES (?, ?, ?, ?, 'ciclo_531', ?, ?)`,
          [id, userId, block.exercise_id, res.newTrainingMax, ended, ended],
        );
      }

      const s0 = res.suggestion.sets[0];
      const line = res.suggestion.note
        ?? (s0?.weight_kg != null ? `Próxima: ${fmtKg(s0.weight_kg)} kg × ${s0.reps}` : null);
      if (line) next.push({ exercise: block.exercise_name, text: line });
    }
  });

  const main = sets.filter((s) => s.set_type !== 'warmup');

  // Récords: e1RM, peso, reps a un peso, volumen, peso corporal y tiempo, contra todo lo anterior a la sesión
  const prs: SessionSummary['prs'] = [];
  const names = new Map(blocks.map((b) => [b.exercise_id, b.exercise_name]));
  const byEx = new Map<string, SetRow[]>();
  for (const s of sets) byEx.set(s.exercise_id, [...(byEx.get(s.exercise_id) ?? []), s]);
  for (const [ex, todaySets] of byEx) {
    const today: RSet[] = todaySets.map((x) => ({ ...x, session_id: session.id }));
    const hist = await historyAgg(db, ex, session, todayWeights(today));
    const hits = detectRecords(today, hist);
    if (hits.length) prs.push({ exercise: names.get(ex) ?? 'Ejercicio', items: hits.map((h) => h.text) });
  }

  return {
    minutes: Math.round((Date.parse(ended) - Date.parse(session.started_at)) / 60000),
    sets: main.length,
    volumeKg: Math.round(main.reduce((a, s) => a + (s.weight_kg ?? 0) * (s.rep_unit === 'reps' ? s.reps ?? 0 : 0), 0)),
    next,
    prs,
  };
}

// Sesión que quedó abierta (se cerró la app y no se volvió): se cierra a la hora de la última serie
export async function closeStaleSession(db: DB, sessionId: string) {
  const session = await db.get<SessionRow>('SELECT * FROM workout_sessions WHERE id = ?', [sessionId]);
  const last = await db.getOptional<{ t: string | null }>(
    'SELECT max(completed_at) AS t FROM workout_sets WHERE session_id = ? AND deleted_at IS NULL', [sessionId],
  );
  return finishSession(db, session, last?.t ?? session.started_at);
}

// ¿La serie recién guardada bate un récord? Solo lectura: misma detección que el resumen de la sesión
// (detectRecords contra el historial previo), comparando la sesión con y sin esta serie.
// El volumen queda afuera: es de la sesión entera y sonaría en cada serie después de pasarlo.
export async function setBrokeRecord(db: DB, session: SessionRow, exerciseId: string, setId: string): Promise<boolean> {
  const rows = await db.getAll<SetRow>(
    'SELECT * FROM workout_sets WHERE session_id = ? AND exercise_id = ? AND deleted_at IS NULL', [session.id, exerciseId],
  );
  if (!rows.some((r) => r.id === setId)) return false;
  const toR = (xs: SetRow[]): RSet[] => xs.map((x) => ({ ...x, session_id: session.id }));
  const today = toR(rows);
  const before = toR(rows.filter((r) => r.id !== setId));
  const hist = await historyAgg(db, exerciseId, session, todayWeights(today));
  const texts = (t: RSet[]) => detectRecords(t, hist).filter((h) => h.kind !== 'volumen').map((h) => h.text);
  const prev = new Set(texts(before));
  return texts(today).some((t) => !prev.has(t));
}

// ----------------------------------------------------------------- formato (coma decimal)
export function fmtKg(n: number | null | undefined) {
  if (n == null) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

export function parseNum(s: string): number | null {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

// mismo criterio que el SQL (E1RM_WHERE): tope 12 reps, sin calentamiento ni series hijas
export const setE1rm = (s: SetRow) => setE1rmOf(s);

// Máximos del historial previo a la sesión, resueltos en SQL (sin traer todas las series)
const HIST_FROM = `FROM workout_sets WHERE exercise_id = ? AND session_id != ? AND deleted_at IS NULL
  AND set_type != 'warmup' AND completed_at < ?`;

async function historyAgg(db: DB, exerciseId: string, session: SessionRow, weights: number[]): Promise<HistAgg> {
  const p = [exerciseId, session.id, session.started_at];
  const [m, v, ...reps] = await Promise.all([
    db.get<{ e1rm: number | null; max_w: number | null; bw: number | null; sec: number | null }>(
      `SELECT
         max(CASE WHEN ${E1RM_WHERE()} THEN ${E1RM_SQL()} END) AS e1rm,
         max(CASE WHEN rep_unit = 'reps' AND weight_kg > 0 AND reps > 0 AND parent_set_id IS NULL THEN weight_kg END) AS max_w,
         max(CASE WHEN rep_unit = 'reps' AND coalesce(weight_kg, 0) = 0 AND reps > 0 AND parent_set_id IS NULL THEN reps END) AS bw,
         max(CASE WHEN rep_unit = 'sec' AND parent_set_id IS NULL THEN reps END) AS sec
       ${HIST_FROM}`, p),
    db.get<{ v: number | null }>(
      `SELECT max(v) AS v FROM (SELECT session_id, sum(weight_kg * reps) AS v ${HIST_FROM}
         AND rep_unit = 'reps' AND weight_kg > 0 AND reps > 0 GROUP BY session_id)`, p),
    ...weights.map((w) => db.get<{ r: number | null }>(
      `SELECT max(reps) AS r ${HIST_FROM}
         AND rep_unit = 'reps' AND weight_kg >= ? AND reps > 0 AND parent_set_id IS NULL`, [...p, w])),
  ]);
  return {
    e1rm: m.e1rm, maxW: m.max_w, bwReps: m.bw, sec: m.sec, vol: v.v,
    repsAtOrAbove: new Map(weights.map((w, i) => [w, reps[i]?.r ?? null])),
  };
}
