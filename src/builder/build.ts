// Armador automático de rutinas. Función pura: recibe el catálogo y los inputs, devuelve la rutina.
// Corre en el cliente (offline). Se prueba con el catálogo real exportado de Postgres.

export type Goal = 'perder_grasa' | 'ganar_masa' | 'recomposicion' | 'fuerza';
export type Level = 'principiante' | 'intermedio' | 'avanzado';
export type EquipmentProfile = 'gimnasio' | 'mancuernas' | 'casa';
export type Joint = 'rodilla' | 'cadera' | 'lumbar' | 'hombro' | 'codo' | 'muneca' | 'tobillo' | 'cuello';

export type BuilderInput = {
  goal: Goal; level: Level; days: number; minutes: number;
  equipment: EquipmentProfile; injuries: Joint[];
};

export type GoalRule = {
  goal: Goal; name: string; method_goal: string;
  compound_reps_min: number; compound_reps_max: number; isolation_reps_min: number; isolation_reps_max: number;
  rir_min: number; rir_max: number; isolation_rir_min: number; isolation_rir_max: number;
  sets_week_min: number; sets_week_max: number; cardio_z2_min_week: number; cardio_z2_max_week: number;
  steps_target: number | null; hiit_per_week: number; no_hiit_before_legs: boolean; sec_per_set: number;
};

export type CatExercise = {
  id: string; slug: string; name_es: string; mechanic: string | null; equipment: string | null;
  movement_pattern: string | null; primary_muscles: string[]; joints: string[];
  images?: string | null; // JSON crudo de fotos, solo para mostrar la miniatura
};

export type CatBlock = {
  id: string; template_id: string; position: number; exercise_id: string; set_type: string;
  sets: number; reps_min: number; reps_max: number; rep_unit: string; rest_sec: number; tempo: string | null;
  intensity: { type: string; value?: number | null }; technique_id: string | null;
  technique_params: unknown; group_key: string | null; progression: { kind: string } | null; notes: string | null;
};

export type CatMethod = {
  id: string; slug: string; name: string; category: string; goals: string[]; level: Level;
  days_min: number; days_max: number; equipment: string[];
  default_progression: unknown; rules: Record<string, unknown>; recovery_days_min: number; version: number;
  templates: { id: string; day_index: number; name: string; blocks: CatBlock[] }[];
};

export type Catalog = {
  methods: CatMethod[];
  exercises: Map<string, CatExercise>;
  substitutes: Map<string, { substitute_id: string; priority: number }[]>;
  rules: Map<Goal, GoalRule>;
};

export type BuiltBlock = Omit<CatBlock, 'id' | 'template_id'> & {
  source_block_id: string | null; exercise: CatExercise; changed?: string;
};
export type BuiltDay = { day_index: number; name: string; blocks: BuiltBlock[]; estMinutes: number };

export type BuiltRoutine = {
  method: CatMethod;
  alternatives: { method: CatMethod; reason: string }[];
  reason: string;
  daysPerWeek: number;
  days: BuiltDay[];
  weeklySets: Record<string, number>;
  targetWeekly: number | null;          // series/músculo/semana objetivo (null en métodos con reglas propias)
  cardio: { z2MinWeek: [number, number]; steps: number | null; hiit: number; note: string | null };
  changes: string[];
  keepsMethodRules: boolean;
};

// Métodos cuya identidad son sus reps/intensidad: no se reescriben
const STRICT = new Set(['stronglifts-5x5', '531', 'gvt', 'heavy-duty', 'fst-7']);

const LEVEL_RANK: Record<Level, number> = { principiante: 1, intermedio: 2, avanzado: 3 };

const ALLOWED_EQUIPMENT: Record<EquipmentProfile, Set<string> | null> = {
  gimnasio: null, // todo
  mancuernas: new Set(['dumbbell', 'body only']),
  casa: new Set(['body only']),
};

export const MUSCLE_ES: Record<string, string> = {
  chest: 'Pecho', lats: 'Dorsales', 'middle back': 'Espalda media', 'lower back': 'Lumbares',
  shoulders: 'Hombros', biceps: 'Bíceps', triceps: 'Tríceps', quadriceps: 'Cuádriceps',
  hamstrings: 'Isquios', glutes: 'Glúteos', calves: 'Gemelos', abdominals: 'Abdominales',
  traps: 'Trapecios', forearms: 'Antebrazos', abductors: 'Abductores', adductors: 'Aductores', neck: 'Cuello',
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const levelT = (l: Level) => (l === 'principiante' ? 0 : l === 'intermedio' ? 0.5 : 1);

function exerciseOk(e: CatExercise, inp: BuilderInput) {
  const allowed = ALLOWED_EQUIPMENT[inp.equipment];
  if (allowed && !allowed.has(e.equipment ?? '')) return false;
  return !e.joints.some((j) => inp.injuries.includes(j as Joint));
}

// Si la lesión bloquea todo el patrón, se cambia por uno que cargue la zona distinto
const PATTERN_FALLBACK: Record<string, string[]> = {
  squat: ['hip_extension', 'hinge'], lunge: ['hip_extension'], knee_extension: ['hip_extension'],
  hinge: ['hip_extension', 'knee_flexion'], horizontal_push: ['chest_fly'],
  vertical_push: ['shoulder_abduction'], horizontal_pull: ['vertical_pull'], vertical_pull: ['horizontal_pull'],
};

// Reemplazo: 1) mismo patrón y músculo  2) tabla curada  3) mismo patrón  4) patrón alternativo
function substitute(cat: Catalog, ex: CatExercise, inp: BuilderInput, used: Set<string>): CatExercise | null {
  const ok = (c: CatExercise | undefined): c is CatExercise =>
    !!c && c.id !== ex.id && exerciseOk(c, inp) && !used.has(c.id);
  const all = [...cat.exercises.values()];
  const samePattern = ex.movement_pattern ? all.filter((c) => c.movement_pattern === ex.movement_pattern && ok(c)) : [];
  const sameMuscle = samePattern.find((c) => c.primary_muscles[0] === ex.primary_muscles[0]);
  if (sameMuscle) return sameMuscle;
  for (const s of cat.substitutes.get(ex.id) ?? []) {
    const c = cat.exercises.get(s.substitute_id);
    if (ok(c)) return c;
  }
  if (samePattern[0]) return samePattern[0];
  for (const p of PATTERN_FALLBACK[ex.movement_pattern ?? ''] ?? []) {
    const c = all.find((x) => x.movement_pattern === p && ok(x));
    if (c) return c;
  }
  return null;
}

function why(ex: CatExercise, inp: BuilderInput) {
  const allowed = ALLOWED_EQUIPMENT[inp.equipment];
  if (allowed && !allowed.has(ex.equipment ?? '')) return 'equipo';
  const j = ex.joints.find((x) => inp.injuries.includes(x as Joint));
  return j ? `cuida ${j === 'muneca' ? 'muñeca' : j}` : 'otro';
}

// ----------------------------------------------------------------- elección del método
function scoreMethod(
  m: CatMethod, inp: BuilderInput, rule: GoalRule, levelUp = 0,
): { score: number; reason: string } | null {
  if (inp.days < m.days_min || inp.days > m.days_max) return null;
  if (LEVEL_RANK[m.level] > LEVEL_RANK[inp.level] + levelUp) return null;
  if (!m.goals.includes(rule.method_goal)) return null;
  const bodyOnly = m.equipment.length === 1 && m.equipment[0] === 'body only';
  if (inp.equipment === 'casa' && !bodyOnly) return null;
  if (inp.equipment !== 'casa' && bodyOnly) return null;

  let score = 0;
  const parts: string[] = [];
  if (m.level === inp.level) { score += 3; parts.push(`nivel ${inp.level}`); }
  else score += 1;
  if (m.goals[0] === rule.method_goal) { score += 2; parts.push(`enfocado en ${rule.method_goal}`); }
  if (inp.goal === 'fuerza' && m.category === 'fuerza') score += 2;
  if (inp.goal !== 'fuerza' && m.category === 'fuerza') score -= 1;
  // en déficit, métodos de volumen extremo o al fallo absoluto rinden peor
  if (inp.goal === 'perder_grasa' && (m.slug === 'gvt' || m.slug === 'heavy-duty')) score -= 2;
  if (m.days_min === m.days_max && m.days_min === inp.days) { score += 1; parts.push(`${inp.days} días justos`); }
  else parts.push(`${m.days_min}-${m.days_max} días`);

  // tiempo estimado por sesión
  const rule_s = rule.sec_per_set;
  const avgSets = m.templates.reduce((a, t) => a + t.blocks.reduce((b, x) => b + x.sets, 0), 0) / Math.max(1, m.templates.length);
  const est = (avgSets * rule_s) / 60;
  if (est > inp.minutes * 1.25) score -= 2;
  return { score, reason: parts.join(' · ') };
}

// ----------------------------------------------------------------- armado
export const MAIN_MUSCLES = new Set(['chest', 'lats', 'middle back', 'shoulders', 'quadriceps', 'hamstrings', 'glutes']);

export function buildRoutine(cat: Catalog, inp: BuilderInput): BuiltRoutine | null {
  const rule = cat.rules.get(inp.goal);
  if (!rule) throw new Error(`Sin reglas para ${inp.goal}`);

  const rank = (levelUp: number) => cat.methods
    .map((m) => ({ m, s: scoreMethod(m, inp, rule, levelUp) }))
    .filter((x): x is { m: CatMethod; s: { score: number; reason: string } } => x.s != null)
    .sort((a, b) => b.s.score - a.s.score || a.m.name.localeCompare(b.m.name));
  let ranked = rank(0);
  // Principiante con 4+ días: no hay métodos de su nivel; se usa uno de un nivel más con RIR más alto
  let steppedUp = false;
  if (!ranked.length && inp.level !== 'avanzado') { ranked = rank(1); steppedUp = ranked.length > 0; }
  if (!ranked.length) return null;

  // El mejor puntaje que quede completo después de sustituir (cada día con ejercicios suficientes)
  let firstTry: BuiltRoutine | null = null;
  for (const [i, cand] of ranked.entries()) {
    const built = buildFor(cat, inp, rule, cand.m, cand.s.reason, steppedUp);
    built.alternatives = ranked.filter((_, j) => j !== i).slice(0, 2).map((x) => ({ method: x.m, reason: x.s.reason }));
    const minBlocks = built.keepsMethodRules ? 2 : 3;
    if (built.days.every((d) => d.blocks.length >= minBlocks)) {
      if (i > 0 && firstTry) built.changes.unshift(`${firstTry.method.name} quedaba incompleto con tu equipo o lesiones`);
      return built;
    }
    firstTry ??= built;
  }
  firstTry!.changes.unshift('Con tu equipo y lesiones ningún método queda completo: revisá los días vacíos');
  firstTry!.days = firstTry!.days.filter((d) => d.blocks.length > 0);
  return firstTry;
}

function buildFor(
  cat: Catalog, inp: BuilderInput, rule: GoalRule, method: CatMethod, reason: string, steppedUp = false,
): BuiltRoutine {
  const strict = STRICT.has(method.slug);
  const changes: string[] = [];
  if (steppedUp) {
    changes.push(`No hay métodos de ${inp.level} para ${inp.days} días: uso uno de nivel ${method.level} con 1 de RIR extra. Si te cuesta recuperar, bajá a 3 días.`);
  }
  const methodProg = (method.default_progression as { kind?: string } | null)?.kind ?? 'double';
  // Métodos con bloques de fuerza propios (ej. PHUL): los días de hipertrofia ya están diseñados, no se tocan sus reps
  // (solo progresiones de carga: 'reps' de una plancha o bloques en segundos no cuentan)
  const STRENGTH_KINDS = new Set(['linear', 'wave_531', 'fixed_pct']);
  const hasStrengthBlocks = method.templates.some((t) => t.blocks.some((b) =>
    b.rep_unit !== 'sec' && !!b.progression && STRENGTH_KINDS.has(b.progression.kind)));
  // Músculos que el método entrena directo antes de sustituir (para avisar si alguno quedó en 0)
  const originalMuscles = new Set(method.templates.flatMap((t) => t.blocks.map((b) => cat.exercises.get(b.exercise_id)?.primary_muscles[0]))
    .filter((m): m is string => !!m));
  const maxSets = Math.floor((inp.minutes * 60) / rule.sec_per_set);
  const daySets = (d: BuiltDay) => d.blocks.reduce((a, b) => a + b.sets, 0);
  const freq = inp.days / Math.max(1, method.templates.length); // veces por semana de cada día

  // 1) ejercicios: sustitución por equipo y lesiones (sin repetir ejercicios en el día)
  let days: BuiltDay[] = method.templates.map((t) => {
    const used = new Set(t.blocks.map((b) => b.exercise_id));
    const subFor = new Map<string, CatExercise | null>(); // original -> sustituto (principal y BBB iguales)
    const blocks: BuiltBlock[] = [];
    for (const b of t.blocks) {
      const orig = cat.exercises.get(b.exercise_id);
      if (!orig) continue;
      let ex = orig;
      let changed: string | undefined;
      const { id, template_id, ...rest } = b;
      const block: BuiltBlock = { ...rest, exercise_id: ex.id, exercise: ex, source_block_id: id };
      if (!exerciseOk(orig, inp)) {
        const first = !subFor.has(orig.id);
        if (first) subFor.set(orig.id, substitute(cat, orig, inp, used));
        const sub = subFor.get(orig.id) ?? null;
        const motivo = why(orig, inp);
        if (!sub) { if (first) changes.push(`${t.name}: saqué ${orig.name_es} (${motivo})`); continue; }
        if (first) changes.push(`${t.name}: ${orig.name_es} → ${sub.name_es} (${motivo})`);
        changed = `en lugar de ${orig.name_es}`;
        ex = sub;
        used.add(sub.id);
        // Isométrico (plancha) reemplazado por un ejercicio dinámico: pasa a reps
        if (block.rep_unit === 'sec' && sub.slug !== 'plank') {
          block.rep_unit = 'reps'; block.reps_min = 8; block.reps_max = 15;
        }
        // El sustituto no tiene 1RM ni training max: se autorregula por RIR
        if (block.intensity.type === 'pct_tm' || block.intensity.type === 'pct_1rm') {
          const bbb = block.intensity.type === 'pct_tm' && block.intensity.value != null;
          block.intensity = { type: 'rir', value: bbb ? 3 : 2 };
          if (!bbb) { block.reps_min = 5; block.reps_max = 8; }
          block.progression = { kind: 'double', inc_kg: 2.5 } as { kind: string };
          if (first) changes.push(`${t.name}: ${sub.name_es} va por RIR (no tiene training max)`);
        }
      }
      blocks.push({ ...block, exercise_id: ex.id, exercise: ex, changed });
    }
    return { day_index: t.day_index, name: t.name, blocks, estMinutes: 0 };
  });

  if (!strict) {
    // 2) reps e intensidad según objetivo (se respetan bloques con progresión propia, ej. fuerza de PHUL)
    const rir = Math.round((rule.rir_min + rule.rir_max) / 2);
    const isoRir = Math.round((rule.isolation_rir_min + rule.isolation_rir_max) / 2);
    for (const d of days) {
      d.blocks.forEach((b) => {
        // progresión propia del bloque (ej. fuerza de PHUL) o del método (ej. calistenia por reps): no se toca
        if ((b.progression?.kind ?? methodProg) !== 'double') return;
        if (b.rep_unit === 'sec') return;
        const compound = b.exercise.mechanic === 'compound';
        if (!hasStrengthBlocks) {
          b.reps_min = compound ? rule.compound_reps_min : rule.isolation_reps_min;
          b.reps_max = compound ? rule.compound_reps_max : rule.isolation_reps_max;
        }
        if (b.intensity.type === 'rir' || b.intensity.type === 'none') {
          b.intensity = { type: 'rir', value: (compound ? rir : isoRir) + (steppedUp ? 1 : 0) };
        }
        if (b.reps_max <= 6) b.rest_sec = Math.max(b.rest_sec, 180);
      });
    }

    // 3) volumen: de a una serie por bloque, repartido, hasta acercarse al objetivo semanal
    const target = lerp(rule.sets_week_min, rule.sets_week_max, levelT(inp.level));
    const all = days.flatMap((d) => d.blocks).filter((b) => b.rep_unit === 'reps');
    const byMuscle = new Map<string, BuiltBlock[]>();
    for (const b of all) {
      const m = b.exercise.primary_muscles[0];
      if (m) byMuscle.set(m, [...(byMuscle.get(m) ?? []), b]);
    }
    for (const [m, blocks] of byMuscle) {
      const cap = (b: BuiltBlock) => (b.reps_max <= 6 ? 5 : 4);
      const cur = () => blocks.reduce((a, b) => a + b.sets, 0) * freq;
      let guard = 50;
      while (MAIN_MUSCLES.has(m) && cur() + freq <= target + freq / 2 && guard--) {
        const b = [...blocks].sort((x, y) => x.sets - y.sets).find((x) => x.sets < cap(x));
        if (!b) break;
        b.sets++;
      }
      guard = 50;
      while (cur() - freq >= target && guard--) {
        const b = [...blocks].sort((x, y) => y.sets - x.sets).find((x) => x.sets > 2);
        if (!b) break;
        b.sets--;
      }

      // faltan series aun con los bloques al tope: sumo un ejercicio del músculo
      const deficit = target - cur();
      // (en métodos con días de fuerza propios no se agrega volumen)
      if (MAIN_MUSCLES.has(m) && methodProg === 'double' && !hasStrengthBlocks && deficit >= 2 * freq) {
        // solo en un día que ya entrena el músculo y tiene lugar en el tiempo disponible
        const day = days
          .filter((d) => d.blocks.some((b) => b.exercise.primary_muscles[0] === m) && maxSets - daySets(d) >= 2)
          .sort((a, b) => daySets(a) - daySets(b))[0];
        const inDay = new Set(day?.blocks.map((b) => b.exercise_id));
        const hasCompound = day?.blocks.some((b) => b.exercise.primary_muscles[0] === m && b.exercise.mechanic === 'compound');
        const pool = [...cat.exercises.values()].filter((e) =>
          e.primary_muscles[0] === m && e.movement_pattern && !inDay.has(e.id) && exerciseOk(e, inp));
        const pick = pool.find((e) => (hasCompound ? e.mechanic === 'isolation' : e.mechanic === 'compound')) ?? pool[0];
        if (day && pick) {
          const sets = Math.min(clamp(Math.ceil(deficit / freq), 2, 4), maxSets - daySets(day));
          const compound = pick.mechanic === 'compound';
          const nb: BuiltBlock = {
            position: day.blocks.length + 1, exercise_id: pick.id, exercise: pick, source_block_id: null,
            set_type: 'working', sets,
            reps_min: compound ? rule.compound_reps_min : rule.isolation_reps_min,
            reps_max: compound ? rule.compound_reps_max : rule.isolation_reps_max,
            rep_unit: 'reps', rest_sec: compound ? 120 : 75, tempo: null,
            intensity: { type: 'rir', value: (compound ? rir : isoRir) + (steppedUp ? 1 : 0) },
            technique_id: null, technique_params: null, group_key: null, progression: null,
            notes: null, changed: 'agregado para llegar al volumen',
          };
          day.blocks.push(nb);
          blocks.push(nb);
          changes.push(`${day.name}: agregué ${pick.name_es} ${sets}×${nb.reps_min}-${nb.reps_max} (${MUSCLE_ES[m] ?? m} quedaba corto)`);
        }
      }
    }
  }

  // 4) tope de tiempo: bajo series de aislamientos (mín. 2), después de compuestos (mín. 3),
  //    después compuestos a 2; recién ahí saco aislamientos del final
  for (const d of days) {
    const total = () => daySets(d);
    if (!strict) {
      const passes: [(b: BuiltBlock) => boolean, number][] = [
        [(b) => b.exercise.mechanic !== 'compound', 2],
        [(b) => b.exercise.mechanic === 'compound', 3],
        [() => true, 2],
      ];
      for (const [pick, min] of passes) {
        let guard = 100;
        while (total() > maxSets && guard--) {
          const b = [...d.blocks].filter(pick).sort((x, y) => y.sets - x.sets).find((x) => x.sets > min);
          if (!b) break;
          b.sets--;
        }
      }
    }
    while (total() > maxSets && d.blocks.length > 1) {
      const idx = d.blocks.map((b) => b.exercise.mechanic).lastIndexOf('isolation');
      const [gone] = d.blocks.splice(idx >= 0 ? idx : d.blocks.length - 1, 1);
      if (gone) changes.push(`${d.name}: saqué ${gone.exercise.name_es} (tiempo)`);
    }
  }
  days = days.map((d) => ({
    ...d,
    blocks: d.blocks.map((b, i) => ({ ...b, position: i + 1 })),
    estMinutes: Math.round((d.blocks.reduce((a, b) => a + b.sets, 0) * rule.sec_per_set) / 60),
  }));

  if (!strict) {
    const target = lerp(rule.sets_week_min, rule.sets_week_max, levelT(inp.level));
    const final = weeklySets(days, freq);
    const low: string[] = [];
    const short: string[] = [];
    const zero: string[] = [];
    for (const m of MAIN_MUSCLES) {
      // si el método no lo entrenaba directo no se avisa (ej. glúteos en torso/pierna van por sentadilla);
      // si lo entrenaba y quedó en 0 por equipo o lesión, sí
      const v = final[m] ?? (originalMuscles.has(m) ? 0 : null);
      if (v == null) continue;
      const txt = `${MUSCLE_ES[m] ?? m} ${Math.round(v)}`;
      if (v === 0) zero.push(MUSCLE_ES[m] ?? m);
      else if (v < rule.sets_week_min) low.push(txt);
      else if (v < target * 0.75) short.push(txt);
    }
    if (zero.length) changes.push(`Sin trabajo directo por tu equipo o lesión: ${zero.join(', ')}. Consultá con un profesional qué variantes podés hacer.`);
    if (low.length) changes.push(`Debajo del mínimo semanal (${rule.sets_week_min} series): ${low.join(', ')}. Sumá minutos por sesión o un día.`);
    if (short.length) changes.push(`Lejos del objetivo (${target} series): ${short.join(', ')}.`);
  }

  const z2: [number, number] = inp.level === 'principiante'
    ? [rule.cardio_z2_min_week, lerp(rule.cardio_z2_min_week, rule.cardio_z2_max_week, 0.5)]
    : [rule.cardio_z2_min_week, rule.cardio_z2_max_week];

  return {
    method, reason, alternatives: [], daysPerWeek: inp.days, days,
    weeklySets: weeklySets(days, freq),
    targetWeekly: strict ? null : lerp(rule.sets_week_min, rule.sets_week_max, levelT(inp.level)),
    cardio: {
      z2MinWeek: z2, steps: rule.steps_target, hiit: rule.hiit_per_week,
      note: rule.no_hiit_before_legs ? 'Nada de HIIT el día antes de pierna' : null,
    },
    changes, keepsMethodRules: strict,
  };
}

// Si no hay método para esos días, busca la cantidad de días más cercana que sí arma
export function suggestDays(cat: Catalog, inp: BuilderInput): number | null {
  const order = [3, 4, 2, 5, 6].filter((d) => d !== inp.days).sort((a, b) => Math.abs(a - inp.days) - Math.abs(b - inp.days));
  return order.find((d) => buildRoutine(cat, { ...inp, days: d }) != null) ?? null;
}

export function weeklySets(days: BuiltDay[], freq: number) {
  const w: Record<string, number> = {};
  for (const d of days) for (const b of d.blocks) {
    const m = b.exercise.primary_muscles[0];
    if (m) w[m] = (w[m] ?? 0) + b.sets * freq;
  }
  for (const k of Object.keys(w)) w[k] = Math.round((w[k] ?? 0) * 10) / 10;
  return w;
}
