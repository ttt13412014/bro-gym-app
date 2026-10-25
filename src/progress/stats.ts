// Cuentas para el mapa muscular, el calendario y las tarjetas del inicio (todo local).
import { localIso, mondayOf } from '@/lib/nutrition';
import { parseJson } from '@/workout/data';

// ----------------------------------------------------------------- series por músculo
// Directo = 1 serie; como músculo secundario = media serie. Sin calentamiento ni series hijas.
export const MUSCLE_SETS_SQL = `
  SELECT e.primary_muscles AS pm, e.secondary_muscles AS sm, count(*) AS n
  FROM workout_sets w JOIN exercises e ON e.id = w.exercise_id
  WHERE w.deleted_at IS NULL AND w.set_type != 'warmup' AND w.parent_set_id IS NULL
    AND date(w.completed_at, 'localtime') >= ?
  GROUP BY w.exercise_id`;

export function muscleSets(rows: { pm: string | null; sm: string | null; n: number }[]) {
  const out: Record<string, number> = {};
  for (const r of rows) {
    for (const m of parseJson<string[]>(r.pm, [])) out[m] = (out[m] ?? 0) + r.n;
    for (const m of parseJson<string[]>(r.sm, [])) out[m] = (out[m] ?? 0) + r.n * 0.5;
  }
  return out;
}

// Escala (series por semana): 0 · 1-3 · 4-9 · 10-19 · 20+
export const MUSCLE_STEPS = [
  { min: 0.5, label: '1-3' }, { min: 4, label: '4-9' }, { min: 10, label: '10-19' }, { min: 20, label: '20+' },
];
export function muscleLevel(v: number) {
  let l = 0;
  MUSCLE_STEPS.forEach((s, i) => { if (v >= s.min) l = i + 1; });
  return l; // 0..4
}
export const LEVEL_ALPHA = ['00', '40', '73', 'B3', 'FF'];

// ----------------------------------------------------------------- días y rachas
const DAY = 86_400_000;
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localIso(d);
};

// Racha en semanas (lunes a domingo) con al menos una sesión.
// La semana en curso sin sesión todavía no corta la racha.
export function weekStreaks(days: string[], today = localIso(new Date())) {
  const weeks = new Set(days.map((d) => mondayOf(new Date(`${d}T12:00:00`))));
  const thisWeek = mondayOf(new Date(`${today}T12:00:00`));
  let current = 0;
  let wk = weeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  while (weeks.has(wk)) { current++; wk = addDays(wk, -7); }
  const sorted = [...weeks].sort();
  let best = 0, run = 0, prev: string | null = null;
  for (const w of sorted) {
    run = prev && addDays(prev, 7) === w ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return { current, best: Math.max(best, current) };
}

// Duración de una sesión en minutos (las olvidadas abiertas no cuentan; tope 4 h)
export const SESSION_DAYS_SQL = `
  SELECT date(started_at, 'localtime') AS d, count(*) AS n,
    sum(min(240, max(0, (julianday(ended_at) - julianday(started_at)) * 1440))) AS min
  FROM workout_sessions
  WHERE deleted_at IS NULL AND ended_at IS NOT NULL AND date(started_at, 'localtime') >= ?
  GROUP BY d`;

export const minutesLevel = (m: number) => (m <= 0 ? 0 : m < 30 ? 1 : m < 60 ? 2 : m < 90 ? 3 : 4);
export { DAY };
