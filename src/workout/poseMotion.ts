// Modo cámara: lógica pura (sin React) que convierte los puntos del cuerpo en
// "se está moviendo / paró" y cuenta repeticiones. Probada con datos simulados (curl, sentadilla, ruido, quieto).
//
// Cómo funciona
// - Cada cuadro (~15 por segundo) trae 33 puntos de ML Kit. Se usan hombros, codos, muñecas,
//   caderas, rodillas y tobillos; un punto vale si su confianza es ≥ VIS.
// - De esos puntos salen 7 señales: ángulo de codo, rodilla, cadera y hombro (grados) y altura
//   de muñecas, cadera y hombros (en "torsos": distancia hombros-cadera, así no importa a qué
//   distancia esté el teléfono). Cada señal se suaviza (media exponencial).
// - Movimiento: alguna señal varió más de START_ANGLE / START_POS en el último segundo y pico.
// - Quieto: TODAS variaron menos de STILL_ANGLE / STILL_POS durante STOP_MS (2,5 s), o el cuerpo
//   salió de cuadro más de LOST_MS. Solo cuenta como serie si hubo ≥1 rep o ≥ MIN_SET_MS moviéndose.
// - Reps: cada señal tiene su contador con umbrales adaptativos (30 % y 70 % del rango recorrido
//   en la serie: histéresis). Una rep = salir de la posición inicial, cruzar al otro extremo y
//   volver. Mínimo MIN_REP_MS entre reps (sin dobles). Entre las señales con recorrido grande
//   manda la que más reps contó.

export const VIS = 0.5;
const ALPHA = 0.45;            // suavizado
const START_WIN = 1500;        // ventana para detectar que arrancó
const STOP_MS = 2500;          // quieto este tiempo = paró
const LOST_MS = 3000;          // sin cuerpo este tiempo, después de moverse = paró
const MIN_SET_MS = 6000;       // sin reps contadas, mínimo moviéndose para que valga como serie
const MIN_REP_MS = 700;
const START_ANGLE = 25, START_POS = 0.2;
const STILL_ANGLE = 12, STILL_POS = 0.08;
const MIN_RANGE_ANGLE = 35, MIN_RANGE_POS = 0.3;
const BUFFER_MS = 2500;        // historia que se repasa al arrancar (para no perder la 1ª rep)

// índices ML Kit
const L = { sh: 11, el: 13, wr: 15, hip: 23, kn: 25, an: 27 };
const R = { sh: 12, el: 14, wr: 16, hip: 24, kn: 26, an: 28 };
export const SKELETON: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

type SigKind = 'angle' | 'pos';
const SIGNALS: { key: string; kind: SigKind; label: string }[] = [
  { key: 'elbow', kind: 'angle', label: 'codos' },
  { key: 'knee', kind: 'angle', label: 'rodillas' },
  { key: 'hip', kind: 'angle', label: 'cadera' },
  { key: 'shoulder', kind: 'angle', label: 'hombros' },
  { key: 'wristY', kind: 'pos', label: 'manos' },
  { key: 'hipY', kind: 'pos', label: 'cadera' },
  { key: 'shY', kind: 'pos', label: 'hombros' },
];

type Pt = { x: number; y: number; ok: boolean };
const pt = (p: number[], i: number, aspect: number): Pt => {
  const c = p[i * 3 + 2] ?? 0;
  // y en unidades de ancho (x normalizada a ancho, y a alto: se corrige con la relación de aspecto)
  return { x: p[i * 3] ?? 0, y: (p[i * 3 + 1] ?? 0) / aspect, ok: c >= VIS };
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
function angle(a: Pt, b: Pt, c: Pt): number | null {
  if (!a.ok || !b.ok || !c.ok) return null;
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n < 1e-6) return null;
  return (Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / n))) * 180) / Math.PI;
}
const avg = (...v: (number | null)[]) => {
  const ok = v.filter((x): x is number => x != null && Number.isFinite(x));
  return ok.length ? ok.reduce((s, x) => s + x, 0) / ok.length : null;
};

export type Raw = { t: number; body: boolean; sig: Record<string, number | null> };

// Un cuadro → señales crudas. body = se ven hombros y caderas (el torso entero)
export function extract(points: number[], w: number, h: number, t: number): Raw {
  if (points.length < 99 || w <= 0 || h <= 0) return { t, body: false, sig: {} };
  const aspect = w / h; // y normalizada a alto → pasar a unidades de ancho: y * h / w
  const P = (i: number) => pt(points, i, aspect);
  const l = { sh: P(L.sh), el: P(L.el), wr: P(L.wr), hip: P(L.hip), kn: P(L.kn), an: P(L.an) };
  const r = { sh: P(R.sh), el: P(R.el), wr: P(R.wr), hip: P(R.hip), kn: P(R.kn), an: P(R.an) };
  const torsoL = l.sh.ok && l.hip.ok ? dist(l.sh, l.hip) : null;
  const torsoR = r.sh.ok && r.hip.ok ? dist(r.sh, r.hip) : null;
  const torso = avg(torsoL, torsoR);
  if (torso == null || torso < 0.03) return { t, body: false, sig: {} };
  const y = (a: Pt, b: Pt) => avg(a.ok ? a.y : null, b.ok ? b.y : null);
  const shY = y(l.sh, r.sh);
  const wrY = y(l.wr, r.wr);
  return {
    t, body: true,
    sig: {
      elbow: avg(angle(l.sh, l.el, l.wr), angle(r.sh, r.el, r.wr)),
      knee: avg(angle(l.hip, l.kn, l.an), angle(r.hip, r.kn, r.an)),
      hip: avg(angle(l.sh, l.hip, l.kn), angle(r.sh, r.hip, r.kn)),
      shoulder: avg(angle(l.hip, l.sh, l.el), angle(r.hip, r.sh, r.el)),
      // alturas en torsos: muñecas respecto de hombros; cadera y hombros respecto del cuadro
      wristY: wrY != null && shY != null ? (wrY - shY) / torso : null,
      hipY: (y(l.hip, r.hip) ?? NaN) / torso,
      shY: shY != null ? shY / torso : null,
    },
  };
}

// ----------------------------------------------------------------- contador de una señal
class RepCounter {
  lo = Infinity; hi = -Infinity; v0: number | null = null;
  state: 'H' | 'L' | null = null; start: 'H' | 'L' | null = null; away = false;
  count = 0; lastRep = -Infinity;
  constructor(readonly kind: SigKind) {}
  get range() { return this.hi - this.lo; }
  get norm() { return this.kind === 'angle' ? this.range / 90 : this.range / 0.6; }
  push(v: number, t: number): boolean {
    if (this.v0 == null) this.v0 = v;
    this.lo = Math.min(this.lo, v); this.hi = Math.max(this.hi, v);
    const min = this.kind === 'angle' ? MIN_RANGE_ANGLE : MIN_RANGE_POS;
    if (this.range < min) return false;
    const upper = this.lo + 0.7 * this.range, lower = this.lo + 0.3 * this.range;
    // posición inicial: donde estaba el cuerpo al arrancar la serie
    if (!this.start) this.start = this.v0 >= (this.lo + this.hi) / 2 ? 'H' : 'L';
    const next = v > upper ? 'H' : v < lower ? 'L' : this.state;
    if (next === this.state) return false;
    this.state = next;
    if (next !== this.start) { this.away = true; return false; }
    if (this.away && t - this.lastRep >= MIN_REP_MS) {
      this.away = false; this.count++; this.lastRep = t; return true;
    }
    this.away = false;
    return false;
  }
}

// ----------------------------------------------------------------- detector
export type Phase = 'nobody' | 'ready' | 'moving' | 'stopped';
export type MotionUpdate = { phase: Phase; reps: number; rep?: boolean; ended?: { reps: number; ms: number } };

export class MotionDetector {
  private smooth: Record<string, number> = {};
  private hist: Raw[] = [];          // señales suavizadas de los últimos BUFFER_MS
  private counters: Record<string, RepCounter> = {};
  phase: Phase = 'nobody';
  private movingSince = 0;
  private lastBody = 0;
  private stillSince: number | null = null;
  reps = 0;
  armed = true;                      // false: después de parar, no arranca otra serie hasta rearmar

  /** cuándo arrancó la serie actual (incluye la historia repasada) */
  get startedAt() { return this.movingSince; }

  rearm() { this.armed = true; if (this.phase === 'stopped') this.phase = this.lastBody ? 'ready' : 'nobody'; this.reps = 0; this.counters = {}; }
  reset() { this.smooth = {}; this.hist = []; this.counters = {}; this.phase = 'nobody'; this.reps = 0; this.stillSince = null; this.lastBody = 0; this.armed = true; }

  private rangeIn(ms: number, now: number, key: string) {
    let lo = Infinity, hi = -Infinity;
    for (let i = this.hist.length - 1; i >= 0; i--) {
      const f = this.hist[i]!;
      if (now - f.t > ms) break;
      const v = f.sig[key];
      if (v == null) continue;
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    return hi >= lo ? hi - lo : 0;
  }

  private anyMoved(ms: number, now: number, angleT: number, posT: number) {
    return SIGNALS.some((s) => this.rangeIn(ms, now, s.key) > (s.kind === 'angle' ? angleT : posT));
  }

  private feedCounters(f: Raw): boolean {
    let rep = false;
    for (const s of SIGNALS) {
      const v = f.sig[s.key];
      if (v == null) continue;
      const c = (this.counters[s.key] ??= new RepCounter(s.kind));
      c.push(v, f.t);
    }
    // manda la señal con más recorrido (normalizado); solo se avisa cuando su cuenta sube
    const best = this.dominant();
    const n = best ? best.count : 0;
    if (n > this.reps) { rep = true; this.reps = n; }
    return rep;
  }

  // Entre las señales con recorrido de verdad (≥ 50 % de la que más se movió) manda la que más reps contó:
  // si algunas reps cambian de forma (ej. una con el pecho más caído), una sola señal no se come las otras.
  dominant(): RepCounter | null {
    const cs = Object.values(this.counters).filter((c) => c.count > 0);
    if (!cs.length) return null;
    const maxNorm = Math.max(...cs.map((c) => c.norm));
    let best: RepCounter | null = null;
    for (const c of cs) {
      if (c.norm < maxNorm * 0.5) continue;
      if (!best || c.count > best.count || (c.count === best.count && c.norm > best.norm)) best = c;
    }
    return best;
  }

  push(raw: Raw): MotionUpdate {
    const now = raw.t;
    if (!raw.body) {
      if (this.phase === 'moving' && now - this.lastBody > LOST_MS) return this.finish(now);
      if (this.phase !== 'moving' && this.phase !== 'stopped' && now - this.lastBody > 800) this.phase = 'nobody';
      return { phase: this.phase, reps: this.reps };
    }
    this.lastBody = now;
    const sig: Record<string, number | null> = {};
    for (const s of SIGNALS) {
      const v = raw.sig[s.key];
      if (v == null || !Number.isFinite(v)) { sig[s.key] = null; continue; }
      const prev = this.smooth[s.key];
      const sv = prev == null ? v : prev + ALPHA * (v - prev);
      this.smooth[s.key] = sv; sig[s.key] = sv;
    }
    const f: Raw = { t: now, body: true, sig };
    this.hist.push(f);
    while (this.hist.length && now - this.hist[0]!.t > BUFFER_MS) this.hist.shift();

    if (this.phase === 'nobody') this.phase = this.armed ? 'ready' : 'stopped';
    if (this.phase === 'stopped') return { phase: 'stopped', reps: this.reps };

    if (this.phase === 'ready') {
      if (this.anyMoved(START_WIN, now, START_ANGLE, START_POS)) {
        // arrancó: se repasa la historia para contar desde la posición inicial
        this.phase = 'moving'; this.movingSince = this.hist[0]!.t; this.stillSince = null;
        this.counters = {}; this.reps = 0;
        let rep = false;
        for (const h of this.hist) rep = this.feedCounters(h) || rep;
        return { phase: 'moving', reps: this.reps, rep };
      }
      return { phase: 'ready', reps: 0 };
    }

    // moving
    const rep = this.feedCounters(f);
    const still = !this.anyMoved(STOP_MS, now, STILL_ANGLE, STILL_POS);
    if (still && now - this.movingSince > STOP_MS) return this.finish(now);
    return { phase: 'moving', reps: this.reps, rep };
  }

  private finish(now: number): MotionUpdate {
    const ms = Math.max(0, now - this.movingSince - STOP_MS);
    if (this.reps < 1 && ms < MIN_SET_MS) {
      // fue un acomodo, no una serie
      this.phase = 'ready'; this.counters = {}; this.reps = 0;
      return { phase: 'ready', reps: 0 };
    }
    this.phase = 'stopped'; this.armed = false;
    return { phase: 'stopped', reps: this.reps, ended: { reps: this.reps, ms } };
  }
}
