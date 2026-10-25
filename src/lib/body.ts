// % de grasa estimado con la fórmula de la Marina de EE.UU. (cinta métrica). Error típico ±3-4 puntos.
export function navyBodyFat(p: {
  sex: 'masculino' | 'femenino'; heightCm: number | null; neckCm: number | null; waistCm: number | null; hipCm?: number | null;
}): number | null {
  // sin cuello, cintura y altura (y cadera en mujeres) no hay estimación: nunca se completa con 0
  if (!p.heightCm || !p.neckCm || !p.waistCm) return null;
  const { sex, heightCm: h, neckCm: n, waistCm: w } = p as { sex: typeof p.sex; heightCm: number; neckCm: number; waistCm: number };
  if (sex === 'masculino') {
    if (w - n <= 0) return null;
    const bf = 495 / (1.0324 - 0.19077 * Math.log10(w - n) + 0.15456 * Math.log10(h)) - 450;
    return Number.isFinite(bf) && bf > 2 && bf < 60 ? Math.round(bf * 10) / 10 : null;
  }
  const hip = p.hipCm;
  if (!hip || w + hip - n <= 0) return null;
  const bf = 495 / (1.29579 - 0.35004 * Math.log10(w + hip - n) + 0.221 * Math.log10(h)) - 450;
  return Number.isFinite(bf) && bf > 8 && bf < 65 ? Math.round(bf * 10) / 10 : null;
}
