// Récords de una sesión contra el historial previo. Función pura.
// El historial llega ya agregado (máximos resueltos en SQL: ver HISTORY_*_SQL en workout/data.ts);
// aggregateHistory hace lo mismo en TS y sirve para los tests.
import { setE1rmOf } from './e1rm';

export type RSet = {
  weight_kg: number | null; reps: number | null; rir: number | null; rpe: number | null;
  rep_unit: string; set_type: string; parent_set_id?: string | null; session_id: string;
};

export type HistAgg = {
  e1rm: number | null;          // mejor 1RM estimado
  maxW: number | null;          // peso máximo (series principales con peso)
  bwReps: number | null;        // más reps sin peso
  sec: number | null;           // más segundos en isométricos
  vol: number | null;           // mejor volumen de una sesión (kg × reps, incluye hijas)
  repsAtOrAbove: Map<number, number | null>; // peso -> más reps hechas con ese peso o más
};

export type RecordKind = 'e1rm' | 'peso' | 'reps' | 'volumen' | 'reps_corporal' | 'tiempo';
export type RecordHit = { kind: RecordKind; text: string };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
const half = (n: number) => Math.round(n * 2) / 2;
const work = (s: RSet) => s.set_type !== 'warmup';
const main = (s: RSet) => work(s) && !s.parent_set_id;
export const weighted = (s: RSet) => s.rep_unit === 'reps' && (s.weight_kg ?? 0) > 0 && (s.reps ?? 0) > 0;
const bodyweight = (s: RSet) => s.rep_unit === 'reps' && !(s.weight_kg ?? 0) && (s.reps ?? 0) > 0;
const maxOf = (xs: number[]) => (xs.length ? Math.max(...xs) : null);

// Pesos de hoy para los que hay que buscar "más reps con ese peso o más"
export const todayWeights = (today: RSet[]) =>
  [...new Set(today.filter((s) => main(s) && weighted(s)).map((s) => s.weight_kg!))];

// Misma semántica que el SQL (para tests y para usar sin base)
export function aggregateHistory(history: RSet[], weights: number[]): HistAgg {
  const h = history.filter(work);
  const m = h.filter(main);
  const bySession = new Map<string, number>();
  for (const s of h.filter(weighted)) bySession.set(s.session_id, (bySession.get(s.session_id) ?? 0) + s.weight_kg! * s.reps!);
  return {
    e1rm: maxOf(h.map(setE1rmOf).filter((v): v is number => v != null)),
    maxW: maxOf(m.filter(weighted).map((s) => s.weight_kg!)),
    bwReps: maxOf(m.filter(bodyweight).map((s) => s.reps!)),
    sec: maxOf(m.filter((s) => s.rep_unit === 'sec').map((s) => s.reps ?? 0)),
    vol: maxOf([...bySession.values()].filter((v) => v > 0)),
    repsAtOrAbove: new Map(weights.map((w) => [w, maxOf(m.filter((s) => weighted(s) && s.weight_kg! >= w).map((s) => s.reps!))])),
  };
}

// Solo hay récord si existe historial comparable: el primer registro no cuenta
export function detectRecords(today: RSet[], hist: HistAgg): RecordHit[] {
  const hits: RecordHit[] = [];
  const t = today.filter(work);
  const tm = t.filter(main);

  const e1T = maxOf(t.map(setE1rmOf).filter((v): v is number => v != null));
  if (e1T != null && hist.e1rm != null && e1T > hist.e1rm + 0.25) {
    hits.push({ kind: 'e1rm', text: `1RM est. ${fmt(half(e1T))} kg (antes ${fmt(half(hist.e1rm))})` });
  }

  const wT = maxOf(tm.filter(weighted).map((s) => s.weight_kg!));
  if (wT != null && hist.maxW != null && wT > hist.maxW) hits.push({ kind: 'peso', text: `peso ${fmt(wT)} kg (antes ${fmt(hist.maxW)})` });

  // más reps que nunca con ese peso o más; se queda con la del peso más alto
  let repHit: { w: number; r: number; prev: number } | null = null;
  for (const s of tm.filter(weighted)) {
    const prev = hist.repsAtOrAbove.get(s.weight_kg!) ?? null;
    if (prev != null && s.reps! > prev && (!repHit || s.weight_kg! > repHit.w)) repHit = { w: s.weight_kg!, r: s.reps!, prev };
  }
  if (repHit) hits.push({ kind: 'reps', text: `${repHit.r} reps con ${fmt(repHit.w)} kg (antes ${repHit.prev})` });

  const vT = t.filter(weighted).reduce((a, s) => a + s.weight_kg! * s.reps!, 0);
  if (vT > 0 && hist.vol != null && vT > hist.vol) {
    hits.push({ kind: 'volumen', text: `volumen ${Math.round(vT).toLocaleString('es-AR')} kg (antes ${Math.round(hist.vol).toLocaleString('es-AR')})` });
  }

  const bT = maxOf(tm.filter(bodyweight).map((s) => s.reps!));
  if (bT != null && hist.bwReps != null && bT > hist.bwReps) hits.push({ kind: 'reps_corporal', text: `${bT} reps (antes ${hist.bwReps})` });

  const sT = maxOf(tm.filter((s) => s.rep_unit === 'sec').map((s) => s.reps ?? 0));
  if (sT != null && hist.sec != null && sT > hist.sec) hits.push({ kind: 'tiempo', text: `${sT} s (antes ${hist.sec})` });

  return hits;
}
