// 1RM estimado: Epley ajustado por RIR (RPE -> RIR = 10 - RPE).
// Con 1 rep efectiva (1 rep a RIR 0) el 1RM es el peso levantado, no 1,033 × peso.
// Fuente única para TS, SQLite (SQL de abajo) y Postgres (columna generada, migración 007).
export const MAX_E1RM_REPS = 12; // con series más largas el estimado deja de ser confiable

export function e1rmOf(weight: number, reps: number, rir = 0) {
  const eff = reps + rir;
  return eff <= 1 ? weight : weight * (1 + eff / 30);
}

export function weightForE1rm(e1: number, reps: number, rir: number) {
  const eff = reps + rir;
  return eff <= 1 ? e1 : e1 / (1 + eff / 30);
}

type SetLike = {
  weight_kg: number | null; reps: number | null; rir: number | null; rpe: number | null;
  rep_unit: string; set_type: string; parent_set_id?: string | null;
};

// Qué series sirven para estimar: con peso, en reps, 1-12, sin calentamiento ni series hijas (drops, myo)
export function isE1rmSet(s: SetLike) {
  return s.rep_unit === 'reps' && (s.weight_kg ?? 0) > 0 && (s.reps ?? 0) >= 1 && (s.reps ?? 0) <= MAX_E1RM_REPS
    && s.set_type !== 'warmup' && !s.parent_set_id;
}

export function setE1rmOf(s: SetLike) {
  if (!isE1rmSet(s)) return null;
  return e1rmOf(s.weight_kg!, s.reps!, s.rir ?? (s.rpe != null ? 10 - s.rpe : 0));
}

// ---- SQL (p = alias con punto, ej. 'w.')
const eff = (p = '') => `(${p}reps + coalesce(${p}rir, 10 - ${p}rpe, 0))`;
export const E1RM_SQL = (p = '') =>
  `(CASE WHEN ${eff(p)} <= 1 THEN ${p}weight_kg ELSE ${p}weight_kg * (1 + ${eff(p)} / 30.0) END)`;
export const E1RM_WHERE = (p = '') =>
  `${p}deleted_at IS NULL AND ${p}rep_unit = 'reps' AND ${p}weight_kg > 0 AND ${p}reps BETWEEN 1 AND ${MAX_E1RM_REPS}` +
  ` AND ${p}set_type != 'warmup' AND ${p}parent_set_id IS NULL`;
