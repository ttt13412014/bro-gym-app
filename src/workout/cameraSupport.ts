// Qué ejercicios puede contar el Modo cámara. Fuente única de verdad:
// lo usan la pestaña Cámara, la Biblioteca (badge) y la sesión (botón).
//
// Regla: movimientos de pie o con el cuerpo entero visible, con un rango
// articular grande (codo, rodilla o cadera). Se excluye todo lo acostado,
// las máquinas, prensa/banca, gemelos, encogimientos, estiramientos y lo
// isométrico/por tiempo. El catálogo casi no tiene movement_pattern, así que
// la regla mira el nombre (inglés + español) más categoría/equipo/fuerza.

export type CameraSupportInput = {
  name?: string | null;
  name_es?: string | null;
  category?: string | null;
  equipment?: string | null;
  force?: string | null;
};

const INCLUDE = new RegExp(
  '\\b(' +
    [
      // inglés
      'curls?', 'squats?', 'lunges?', 'split squat', 'step[- ]?ups?',
      'overhead press', 'shoulder press', 'military press', 'push press', 'arnold press', 'clean and press',
      'lateral raises?', 'side lateral', 'front raises?', 'upright rows?',
      'deadlifts?', 'romanian', 'stiff[- ]legged', 'good mornings?', 'swings?', 'thrusters?', 'cleans?', 'snatch(es)?',
      'pull[- ]?ups?', 'chin[- ]?ups?', 'muscle[- ]?ups?', 'push[- ]?ups?', 'dips?', 'bent[- ]over',
      'pushdowns?', 'kickbacks?', 'jumping jacks?', 'burpees?', 'jump squats?', 'overhead (triceps )?extension', 'hammer',
      // español (ejercicios propios cargados solo en castellano)
      'sentadillas?', 'zancadas?', 'estocadas?', 'press militar', 'press de hombros?',
      'elevaci[oó]n(es)? laterales?', 'elevaci[oó]n(es)? frontales?', 'peso muerto', 'dominadas?',
      'flexiones', 'lagartijas', 'fondos', 'remo al ment[oó]n', 'remo inclinado',
    ].join('|') +
    ')\\b',
  'i',
);

const EXCLUDE = new RegExp(
  '\\b(' +
    [
      'lying', 'supine', 'prone', 'bench press', 'floor press', 'leg press', 'leg curls?', 'leg extensions?',
      'calf', 'calves', 'shrugs?', 'stretch', 'plank', 'hold', 'isometric', 'wrist', 'machine', 'lever', 'sled', 'hack',
      'on (a |the )?bench', 'sit[- ]?ups?', 'crunch', 'cable crossover', 'rear delt', 'pullover', 'finger curls?',
      'glute[- ]ham', 'nordic', 'scapular', 'turkish', 'halo', 'kneeling', 'sledgehammer', 'plate movers',
      'jerk dip', 'glute kickback', 'car deadlift', 'side plank',
      'acostad[oa]', 'tumbad[oa]', 'prensa', 'press de banca', 'gemelos?', 'pantorrillas?', 'encogimientos?',
      'estiramiento', 'plancha', 'isom[eé]tric[oa]', 'm[aá]quina', 'mu[ñn]eca', 'n[oó]rdico',
    ].join('|') +
    ')\\b',
  'i',
);

const INCLINE_PRESS = /\b(incline|inclinad[oa])\b/i;
const PRESS_RAISE_ROW = /\b(press|raise|row|elevaci[oó]n|remo)\b/i;
const SEATED = /\b(seated|sentad[oa])\b/i;
const SEATED_BAD = /\b(good mornings?|leg|hamstring|cable|polea|buenos d[ií]as)\b/i;

const cache = new Map<string, boolean>();

export function isCameraSupported(e: CameraSupportInput | null | undefined): boolean {
  if (!e) return false;
  const key = `${e.name ?? ''}|${e.name_es ?? ''}|${e.category ?? ''}|${e.equipment ?? ''}|${e.force ?? ''}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const res = compute(e);
  if (cache.size > 3000) cache.clear();
  cache.set(key, res);
  return res;
}

function compute(e: CameraSupportInput): boolean {
  if (e.category === 'stretching' || e.category === 'cardio') return false;
  if (e.force === 'static') return false;
  if (e.equipment === 'machine' || e.equipment === 'foam roll') return false;
  const t = `${e.name ?? ''} ${e.name_es ?? ''}`;
  if (INCLINE_PRESS.test(t) && PRESS_RAISE_ROW.test(t) && !/curl/i.test(t)) return false;
  if (SEATED.test(t) && SEATED_BAD.test(t)) return false;
  return INCLUDE.test(t) && !EXCLUDE.test(t);
}

/** Lo que NO cuenta, para mostrar en la pantalla Cámara. */
export const CAMERA_UNSUPPORTED_NOTE =
  'No cuenta: press de banca, prensa, máquinas sentado o acostado, gemelos, encogimientos, estiramientos ni ejercicios por tiempo.';
