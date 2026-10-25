// Niveles de fuerza: mejor e1RM vs peso corporal, sexo y altura. Función pura.
export type Lift = 'bench' | 'squat' | 'deadlift';
export const LIFTS: Lift[] = ['bench', 'squat', 'deadlift'];
export const LIFT_ES: Record<Lift, string> = { bench: 'Press de banca', squat: 'Sentadilla', deadlift: 'Peso muerto' };

export type Standard = {
  lift: Lift; sex: 'masculino' | 'femenino'; level_slug: string; bw_multiple: number;
  ref_height_cm: number; height_adj_per_cm: number; height_adj_max: number;
};
export type Level = { slug: string; rank: number; name: string; icon: string; uses_accent: number | boolean };

export type LiftResult = {
  lift: Lift; level: Level; best: number | null; ratio: number | null;
  next: Level | null; kgToNext: number | null;
  required: Record<string, number>;   // kg para entrar a cada nivel (con ajuste por altura)
};

export type StrengthResult = {
  lifts: LiftResult[];
  general: { level: Level; next: Level | null; kgToNext: number | null; nextLifts: Lift[] };
};

const half = (n: number) => Math.round(n * 2) / 2;
const ceilHalf = (n: number) => Math.ceil(n * 2) / 2;

export function heightFactor(s: Standard, heightCm: number) {
  const f = 1 - s.height_adj_per_cm * (heightCm - s.ref_height_cm);
  return Math.min(1 + s.height_adj_max, Math.max(1 - s.height_adj_max, f));
}

export function evaluateStrength(p: {
  standards: Standard[]; levels: Level[]; sex: Standard['sex']; heightCm: number; bodyweightKg: number;
  best: Partial<Record<Lift, number | null>>;
}): StrengthResult {
  const levels = [...p.levels].sort((a, b) => a.rank - b.rank);
  const base = levels[0];
  if (!base) throw new Error('Sin niveles');

  const lifts: LiftResult[] = LIFTS.map((lift) => {
    const required: Record<string, number> = {};
    for (const s of p.standards) {
      if (s.lift === lift && s.sex === p.sex) {
        required[s.level_slug] = half(p.bodyweightKg * s.bw_multiple * heightFactor(s, p.heightCm));
      }
    }
    const best = p.best[lift] ?? null;
    let level = base;
    for (const l of levels) {
      const req = required[l.slug];
      if (req != null && best != null && best >= req) level = l;
    }
    const next = levels.find((l) => l.rank > level.rank && required[l.slug] != null) ?? null;
    const reqNext = next ? required[next.slug] : undefined;
    return {
      lift, level, best, ratio: best != null ? Math.round((best / p.bodyweightKg) * 100) / 100 : null,
      next, kgToNext: reqNext != null ? ceilHalf(reqNext - (best ?? 0)) : null, required,
    };
  });

  // General: la mediana de los 3 (un lift sin datos cuenta como nivel bajo)
  const ranks = lifts.map((l) => l.level.rank).sort((a, b) => a - b);
  const medianRank = ranks[1] ?? base.rank;
  const general = levels.find((l) => l.rank === medianRank) ?? base;
  const nextGeneral = levels.find((l) => l.rank > general.rank) ?? null;

  // Para subir el general hacen falta 2 lifts en el nivel siguiente: los 2 más baratos
  let kgToNext: number | null = null;
  let nextLifts: Lift[] = [];
  if (nextGeneral) {
    const cost = lifts
      .map((l) => {
        const req = l.required[nextGeneral.slug];
        if (req == null) return null;
        return { lift: l.lift, kg: l.level.rank >= nextGeneral.rank ? 0 : ceilHalf(req - (l.best ?? 0)) };
      })
      .filter((x): x is { lift: Lift; kg: number } => x != null)
      .sort((a, b) => a.kg - b.kg)
      .slice(0, 2);
    if (cost.length === 2) {
      kgToNext = cost.reduce((a, c) => a + c.kg, 0);
      nextLifts = cost.filter((c) => c.kg > 0).map((c) => c.lift);
    }
  }

  return { lifts, general: { level: general, next: nextGeneral, kgToNext, nextLifts } };
}
