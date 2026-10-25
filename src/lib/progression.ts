// =====================================================================
// Bro? · progression.ts
// Motor de progresión. Función pura: corre en el celular, sin internet.
//
// Uso:
//  - Al CERRAR una sesión: computeNext({ ...lastSets: sets de esa sesión para el bloque })
//      -> guarda result.state en user_progression_state
//      -> si viene newTrainingMax, insertá fila en user_exercise_maxes (source 'ciclo_531')
//  - Al ABRIR una sesión: computeNext({ ...lastSets: [] })
//      -> prescribe desde el estado guardado, sin avanzar nada
//
// Datos que le pasás (consultas en SQLite local):
//  lastSets : select * from workout_sets where routine_block_id = ? and session_id = ?
//             and deleted_at is null order by set_index
//  bestE1rm : select max(e1rm_kg) from workout_sets where user_id = ? and exercise_id = ?
//             and completed_at > now() - 60 días   (fallback cuando el bloque no tiene historial)
//  maxes    : v_current_maxes del ejercicio
//  planWeek : plan_weeks de la sesión (deload, etc.) o null
// =====================================================================
import { z } from "zod";

export const Intensity = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rir"), value: z.number().min(0).max(5) }),
  z.object({ type: z.literal("rpe"), value: z.number().min(5).max(10) }),
  z.object({ type: z.literal("pct_1rm"), value: z.number().min(0.3).max(1) }),
  z.object({ type: z.literal("pct_tm"), value: z.number().min(0.3).max(1).nullable() }),
  z.object({ type: z.literal("none") }),
]);

export const Progression = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("linear"), inc_kg: z.number(), fail_limit: z.number().int().default(3), deload_pct: z.number().default(0.1) }),
  z.object({ kind: z.literal("double"), inc_kg: z.number(), target_rir: z.number().optional(), fail_limit: z.number().int().default(2), deload_pct: z.number().default(0.1) }),
  z.object({ kind: z.literal("wave_531"), tm_pct: z.number().default(0.9), inc_kg: z.number() }),
  z.object({ kind: z.literal("fixed_pct"), pct: z.number(), inc_kg: z.number(), require_all_sets: z.boolean().default(true) }),
  z.object({ kind: z.literal("reps"), inc_reps: z.number().int(), next_variant_at_reps_max: z.boolean().optional() }),
  z.object({ kind: z.literal("none") }),
]);

export type SetLog = {
  set_type: string; weight_kg: number | null; reps: number | null;
  rir: number | null; rpe: number | null;
};
export type Block = { sets: number; reps_min: number; reps_max: number; intensity: unknown; progression: unknown | null };
export type State = { next_weight_kg: number | null; next_reps: number | null; wave_week: number | null; fail_streak: number };
export type Maxes = { one_rm_kg: number | null; training_max_kg: number | null };
export type PlanWeek = { kind: string; volume_mult: number; intensity_mult: number; rir_offset: number } | null;

export type Prescribed = { weight_kg: number | null; reps: number; amrap?: boolean };
export type Result = {
  suggestion: { sets: Prescribed[]; rir_target: number | null; note?: string };
  state: State;
  newTrainingMax?: number;
};

const round = (w: number, inc: number) => Math.round(w / inc) * inc;
export const rirOf = (s: SetLog) => s.rir ?? (s.rpe != null ? 10 - s.rpe : 0);
export { e1rmOf as e1rm, weightForE1rm as weightFor } from './e1rm';
import { weightForE1rm as weightFor } from './e1rm';

// 5/3/1: [% del TM, reps] por semana. La 3ra serie de las semanas 1-3 es AMRAP.
type Week = 1 | 2 | 3 | 4;
const toWeek = (n: number | null): Week => (n === 2 || n === 3 || n === 4 ? n : 1);
const WAVES: Record<Week, readonly [number, number][]> = {
  1: [[0.65, 5], [0.75, 5], [0.85, 5]],
  2: [[0.70, 3], [0.80, 3], [0.90, 3]],
  3: [[0.75, 5], [0.85, 3], [0.95, 1]],
  4: [[0.40, 5], [0.50, 5], [0.60, 5]], // deload
};

export function computeNext(i: {
  block: Block;
  routineProgression: unknown;   // user_routines.progression (= default del método)
  lastSets: SetLog[];
  bestE1rm: number | null;
  state: State;
  maxes: Maxes;
  planWeek: PlanWeek;
  incKg: number;                 // user_settings.increment_kg / increment_db_kg
}): Result {
  // Override del bloque > progresión de la rutina
  const prog = Progression.parse(i.block.progression ?? i.routineProgression);
  const intensity = Intensity.parse(i.block.intensity);
  const work = i.lastSets.filter(s => s.set_type !== "warmup" && s.reps != null);
  const lastW = work.length ? Math.max(...work.map(s => s.weight_kg ?? 0)) : null;
  const hitAll = (n: number) => work.length >= i.block.sets && work.every(s => (s.reps ?? 0) >= n);
  const minReps = () => Math.min(...work.map(s => s.reps ?? 0));

  const state: State = { ...i.state };
  let weight: number | null = state.next_weight_kg;
  let reps = state.next_reps ?? i.block.reps_min;
  let rir: number | null =
    intensity.type === "rir" ? intensity.value : intensity.type === "rpe" ? 10 - intensity.value : null;
  let note: string | undefined;
  let sets: Prescribed[] | null = null;
  let newTrainingMax: number | undefined;

  // Sin historial del bloque: estimo desde el mejor e1RM del ejercicio
  if (weight == null && lastW == null && i.bestE1rm && rir != null) {
    weight = weightFor(i.bestE1rm, i.block.reps_max, rir);
  }

  switch (prog.kind) {
    case "linear": {
      reps = i.block.reps_max;
      if (lastW != null) {
        if (hitAll(i.block.reps_min)) {
          weight = lastW + prog.inc_kg; state.fail_streak = 0;
        } else if (++state.fail_streak >= prog.fail_limit) {
          weight = lastW * (1 - prog.deload_pct); state.fail_streak = 0;
          note = `Deload: ${prog.fail_limit} fallos seguidos`;
        } else {
          weight = lastW; note = "Repetí el peso";
        }
      }
      break;
    }
    case "double": {
      if (lastW != null) {
        if (!hitAll(i.block.reps_min)) {
          // No llegó al mínimo: con `fail_limit` sesiones seguidas, baja el peso
          reps = i.block.reps_min;
          if (++state.fail_streak >= prog.fail_limit) {
            weight = lastW * (1 - prog.deload_pct); state.fail_streak = 0;
            note = `Bajá el peso: ${prog.fail_limit} sesiones sin llegar a ${i.block.reps_min}`;
          } else {
            weight = lastW; note = "Repetí el peso";
          }
          break;
        }
        state.fail_streak = 0;
        if (hitAll(i.block.reps_max)) {
          weight = lastW + prog.inc_kg; reps = i.block.reps_min; note = "Subí el peso";
        } else {
          weight = lastW; reps = Math.min(minReps() + 1, i.block.reps_max);
        }
        // Autorregulación: si quedó muy lejos del RIR objetivo, salto doble
        const target = prog.target_rir ?? rir;
        if (target != null && work.every(s => rirOf(s) >= target + 3)) {
          weight = lastW + prog.inc_kg * 2; reps = i.block.reps_min; note = "Te sobró mucho: salto doble";
        }
      }
      break;
    }
    case "fixed_pct": { // GVT
      reps = i.block.reps_max;
      const base = i.maxes.one_rm_kg ? i.maxes.one_rm_kg * prog.pct : null;
      if (lastW == null) weight = weight ?? base;
      else weight = hitAll(i.block.reps_max) ? lastW + prog.inc_kg : lastW;
      if (weight == null) note = "Cargá tu 1RM para calcular el 60%";
      break;
    }
    case "wave_531": {
      const tm = i.maxes.training_max_kg ?? (i.maxes.one_rm_kg ? i.maxes.one_rm_kg * prog.tm_pct : null);
      if (!tm) return { suggestion: { sets: [], rir_target: null, note: "Cargá tu 1RM o training max" }, state };
      let week = toWeek(state.wave_week);
      const amrap = work.at(-1);
      if (amrap) { // se cerró la semana `week`
        const minAmrap = WAVES[week][2]?.[1] ?? 0;
        if (week !== 4 && (amrap.reps ?? 0) < minAmrap) {
          state.fail_streak++; note = "No llegaste al mínimo del AMRAP: el TM no sube este ciclo";
        }
        if (week === 4) {
          newTrainingMax = state.fail_streak > 0 ? tm * 0.9 : tm + prog.inc_kg;
          state.fail_streak = 0;
        }
        week = toWeek(week === 4 ? 1 : week + 1);
      }
      state.wave_week = week;
      const t = newTrainingMax ?? tm;
      sets = WAVES[week].map(([p, r], k) => ({ weight_kg: round(t * p, i.incKg), reps: r, amrap: week !== 4 && k === 2 }));
      rir = null;
      weight = null;
      break;
    }
    case "reps": { // calistenia / plancha
      if (work.length) {
        const best = minReps();
        reps = Math.min(best + prog.inc_reps, i.block.reps_max);
        if (best >= i.block.reps_max && prog.next_variant_at_reps_max) note = "Pasá a una variante más difícil";
      }
      weight = lastW && lastW > 0 ? lastW : null; // lastre si usa
      break;
    }
    case "none": { // peso derivado (BBB al 50% TM, etc.)
      reps = i.block.reps_max;
      if (intensity.type === "pct_tm" && intensity.value && i.maxes.training_max_kg) weight = i.maxes.training_max_kg * intensity.value;
      if (intensity.type === "pct_1rm" && i.maxes.one_rm_kg) weight = i.maxes.one_rm_kg * intensity.value;
      break;
    }
  }

  if (weight != null) weight = round(weight, i.incKg);
  // Guardo la progresión ANTES del deload del mesociclo: el deload no la pisa
  if (prog.kind !== "wave_531") { state.next_weight_kg = weight; state.next_reps = reps; }

  let nSets = i.block.sets;
  if (i.planWeek && !sets) {
    nSets = Math.max(1, Math.round(nSets * i.planWeek.volume_mult));
    if (weight != null) weight = round(weight * i.planWeek.intensity_mult, i.incKg);
    if (rir != null) rir = Math.max(0, rir + i.planWeek.rir_offset); // intensificación nunca baja de RIR 0
  }
  sets ??= Array.from({ length: nSets }, () => ({ weight_kg: weight, reps }));

  return { suggestion: { sets, rir_target: rir, note }, state, newTrainingMax };
}
