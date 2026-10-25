// Nutrición: Mifflin-St Jeor, objetivo calórico, macros y ajuste semanal por tendencia de peso.
// Funciones puras (se prueban sin la app).

export type Sex = 'masculino' | 'femenino';
export type NGoal = 'perder_grasa' | 'ganar_masa' | 'recomposicion' | 'fuerza';

export const ACTIVITY = [
  { value: 1.2, label: 'Sedentario', hint: 'Trabajo sentado, casi sin caminar' },
  { value: 1.375, label: 'Liviano', hint: 'Entrenás 2-3 veces o caminás bastante' },
  { value: 1.55, label: 'Moderado', hint: 'Entrenás 3-5 veces' },
  { value: 1.725, label: 'Alto', hint: 'Entrenás 6-7 veces o trabajo físico' },
  { value: 1.9, label: 'Muy alto', hint: 'Doble turno o trabajo muy pesado' },
] as const;

// Ritmo por objetivo en kg/semana (negativo = bajar). El primero es el sugerido.
export const RATES: Record<NGoal, { value: number; label: string }[]> = {
  perder_grasa: [{ value: -0.5, label: '−0,5' }, { value: -0.25, label: '−0,25' }, { value: -0.75, label: '−0,75' }],
  ganar_masa: [{ value: 0.25, label: '+0,25' }, { value: 0.15, label: '+0,15' }, { value: 0.4, label: '+0,4' }],
  recomposicion: [{ value: -0.1, label: '−0,1' }, { value: 0, label: '0' }],
  fuerza: [{ value: 0.1, label: '+0,1' }, { value: 0, label: '0' }, { value: 0.25, label: '+0,25' }],
};

const KCAL_PER_KG = 7700;
const MAX_DEFICIT_PCT = 0.25;   // nunca más de 25% bajo el TDEE
const MIN_KCAL: Record<Sex, number> = { masculino: 1500, femenino: 1200 };

// 'YYYY-MM-DD' -> {y, m, d} sin pasar por Date (new Date('YYYY-MM-DD') es UTC y corre el día en Argentina)
export function parseYmd(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  // fecha real (rechaza 31/02): se arma en hora local y se comparan las partes
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { y, m: mo, d };
}

export function ageFrom(birth: string, today = new Date()) {
  const b = parseYmd(birth);
  if (!b) return NaN;
  let a = today.getFullYear() - b.y;
  const mo = today.getMonth() + 1 - b.m;
  if (mo < 0 || (mo === 0 && today.getDate() < b.d)) a--;
  return a;
}

// Proteína y grasa fijas, carbos con lo que queda. Si no alcanza, se baja la proteína para que cierre.
export function fitMacros(kcal: number, protein: number, fat: number) {
  const left = kcal - protein * 4 - fat * 9;
  if (left >= 0) return { protein, fat, carbs: Math.round(left / 4), note: null as string | null };
  const p = Math.max(0, Math.floor((kcal - fat * 9) / 4));
  return {
    protein: p, fat, carbs: 0,
    note: `Con ${kcal} kcal no entran ${protein} g de proteína: la bajé a ${p} g y no quedan carbohidratos. Conviene subir actividad antes que bajar más.`,
  };
}

// Piso de calorías: nunca más de 25% bajo el gasto ni menos del mínimo por sexo
export function kcalFloor(sex: Sex, tdee: number) {
  return Math.ceil(Math.max(MIN_KCAL[sex], tdee * (1 - MAX_DEFICIT_PCT)) / 10) * 10;
}

// Mifflin-St Jeor
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'masculino' ? 5 : -161);
}

export type Targets = {
  bmr: number; tdee: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number;
  notes: string[];
};

export function computeTargets(p: {
  sex: Sex; weightKg: number; heightCm: number; age: number; activity: number;
  rateKgWeek: number; proteinGKg: number; fatPct: number; adjustKcal?: number;
}): Targets {
  const notes: string[] = [];
  const B = bmr(p.sex, p.weightKg, p.heightCm, p.age);
  const tdee = B * p.activity;
  let kcal = tdee + (p.rateKgWeek * KCAL_PER_KG) / 7 + (p.adjustKcal ?? 0);

  const pctFloor = tdee * (1 - MAX_DEFICIT_PCT);
  const floor = Math.max(MIN_KCAL[p.sex], pctFloor);
  if (kcal < floor) {
    kcal = floor;
    notes.push(floor === pctFloor
      ? 'Limité el déficit al 25% del gasto para no perder músculo'
      : `No bajo de ${MIN_KCAL[p.sex]} kcal: para ir más rápido sumá actividad`);
  }
  kcal = Math.round(kcal / 10) * 10;

  const protein = Math.round(p.proteinGKg * p.weightKg);
  let fat = Math.round((kcal * p.fatPct) / 9);
  const minFat = Math.round(0.6 * p.weightKg); // piso hormonal ~0,6 g/kg
  if (fat < minFat) { fat = minFat; notes.push('Subí la grasa al mínimo de 0,6 g/kg'); }
  const fit = fitMacros(kcal, protein, fat);
  if (fit.note) notes.push(fit.note);

  return { bmr: Math.round(B), tdee: Math.round(tdee), kcal, protein_g: fit.protein, carbs_g: fit.carbs, fat_g: fit.fat, notes };
}

// ----------------------------------------------------------------- ajuste semanal
export type WeekInput = {
  weights: { date: string; kg: number }[];  // pesajes de 2 semanas (actual + anterior)
  weekStart: string;                         // lunes de la semana que se evalúa (YYYY-MM-DD)
  daysLogged: number;                        // días con comidas registradas en la semana
  avgKcalLogged: number | null;
  targetRateKgWeek: number;
};

export type WeekResult = {
  avgWeight: number | null; prevAvgWeight: number | null; changeKg: number | null;
  adherencePct: number; adjustmentKcal: number; reason: string;
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function weeklyCheck(w: WeekInput): WeekResult {
  const start = w.weekStart;
  const end = addDays(start, 7);
  const prevStart = addDays(start, -7);
  const inRange = (a: string, b: string) => w.weights.filter((x) => x.date >= a && x.date < b).map((x) => x.kg);
  const cur = inRange(start, end);
  const prev = inRange(prevStart, start);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const a = avg(cur);
  const p = avg(prev);
  const adherencePct = Math.round((Math.min(7, w.daysLogged) / 7) * 100);
  const base = {
    avgWeight: a == null ? null : round1(a), prevAvgWeight: p == null ? null : round1(p),
    changeKg: a != null && p != null ? round2(a - p) + 0 : null, adherencePct,
  };

  // Sin datos suficientes no se toca: el ruido de agua y sal es más grande que la señal
  if (cur.length < 3 || prev.length < 3) return { ...base, adjustmentKcal: 0, reason: 'Necesito 3 pesajes por semana, dos semanas seguidas' };
  if (adherencePct < 70) return { ...base, adjustmentKcal: 0, reason: 'Registraste menos de 5 días: primero sostené el registro' };

  const diff = (base.changeKg ?? 0) - w.targetRateKgWeek;      // + = subiste más (o bajaste menos) de lo buscado
  if (Math.abs(diff) < 0.1) return { ...base, adjustmentKcal: 0, reason: 'Vas al ritmo buscado' };

  const raw = (-diff * KCAL_PER_KG) / 7;
  const adj = Math.max(-200, Math.min(200, Math.round(raw / 50) * 50));
  return {
    ...base,
    adjustmentKcal: adj,
    reason: adj < 0
      ? `Tu peso va ${fmtSigned(base.changeKg ?? 0)} kg/sem y buscás ${fmtSigned(w.targetRateKgWeek)}: bajo calorías`
      : `Tu peso va ${fmtSigned(base.changeKg ?? 0)} kg/sem y buscás ${fmtSigned(w.targetRateKgWeek)}: subo calorías`,
  };
}

const fmtSigned = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2).replace('.', ',')}`;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100 || 0;

// Lunes de la semana (local) en YYYY-MM-DD
export function mondayOf(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return localIso(x);
}

export const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Macros de una porción a partir de los valores cada 100 g
export function portion(f: { kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number }, grams: number) {
  const k = grams / 100;
  return {
    kcal: Math.round(f.kcal_100g * k * 10) / 10,
    protein_g: Math.round(f.protein_100g * k * 10) / 10,
    carbs_g: Math.round(f.carbs_100g * k * 10) / 10,
    fat_g: Math.round(f.fat_100g * k * 10) / 10,
  };
}
