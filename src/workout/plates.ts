// Discos por lado para ejercicios con barra olímpica. Se carga el total; esto solo ayuda a armar la barra.

export const BAR_KG = 20;

// hasta 2 decimales (1,25 no se redondea a 1,3)
const fmtKg = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
export const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

export type PlateLoad = { perSide: number; plates: number[]; leftover: number };

// null si el peso no alcanza para la barra
export function platesFor(totalKg: number | null | undefined, bar = BAR_KG): PlateLoad | null {
  if (totalKg == null || !Number.isFinite(totalKg) || totalKg < bar) return null;
  const perSide = Math.round(((totalKg - bar) / 2) * 1000) / 1000;
  let rest = perSide;
  const plates: number[] = [];
  for (const p of PLATES) {
    while (rest >= p - 1e-6) { plates.push(p); rest = Math.round((rest - p) * 1000) / 1000; }
  }
  return { perSide, plates, leftover: rest };
}

// "Barra 20 kg · 30 kg por lado" y "25 + 5" (o "solo la barra")
export function plateText(totalKg: number | null | undefined, bar = BAR_KG): { head: string; detail: string } | null {
  const l = platesFor(totalKg, bar);
  if (!l) return null;
  if (l.perSide === 0) return { head: `Barra ${fmtKg(bar)} kg · solo la barra`, detail: '' };
  const counts: [number, number][] = [];
  for (const p of l.plates) {
    const last = counts.at(-1);
    if (last && last[0] === p) last[1]++; else counts.push([p, 1]);
  }
  const detail = counts.map(([p, n]) => (n > 1 ? `${n}×${fmtKg(p)}` : fmtKg(p))).join(' + ')
    + (l.leftover > 0 ? ` (faltan ${fmtKg(l.leftover)} kg: no hay disco tan chico)` : '');
  return { head: `Barra ${fmtKg(bar)} kg · ${fmtKg(l.perSide)} kg por lado`, detail };
}

export const isBarbell = (equipment: string | null | undefined) => equipment === 'barbell';
