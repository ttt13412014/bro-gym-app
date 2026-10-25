// Correcciones de técnica del modo cámara: reglas simples (sin IA) sobre los 33 puntos de ML Kit.
// Es orientativo: no reemplaza a un profe. Lógica pura (sin React), probada con secuencias simuladas
// (scripts/formCheck.test.ts).
//
// Cómo funciona
// - Cada ejercicio compatible cae en una "familia" (sentadilla, estocada, bisagra, curl, press, etc.)
//   con las mismas reglas de nombre que cameraSupport.ts.
// - Cada cuadro se guarda suavizado (media exponencial por punto; vale si confianza ≥ VIS).
// - Cuando el contador marca una rep, se miran los cuadros de esa rep y se evalúan 2–4 chequeos
//   con extremos robustos (se descarta el 8 % más extremo: un cuadro raro no dispara nada) y con
//   margen de tolerancia en cada umbral (mejor callarse que retar de más).
// - Vista: de frente / de costado según el ancho de hombros respecto del torso. Cada chequeo dice
//   en qué vista se puede medir; si no se puede, se saltea (no se inventa).
import { isCameraSupported, type CameraSupportInput } from './cameraSupport';
import { VIS } from './poseMotion';

// colores fijos de las correcciones (se leen igual en claro y oscuro: borde + fondo suave)
export const CUE_OK = '#22A559';
export const CUE_FIX = '#F08A00';

export type Family =
  | 'squat' | 'lunge' | 'hinge' | 'curl' | 'press' | 'raise' | 'row' | 'pullup' | 'pushup' | 'dip' | 'triceps';
export type View = 'front' | 'side' | 'unknown';
type ViewNeed = 'front' | 'side' | 'any';

export const FAMILY_ES: Record<Family, string> = {
  squat: 'Sentadilla', lunge: 'Estocada / zancada', hinge: 'Peso muerto / bisagra', curl: 'Curl', press: 'Press de hombros',
  raise: 'Elevaciones', row: 'Remo', pullup: 'Dominadas', pushup: 'Flexiones', dip: 'Fondos', triceps: 'Extensión de tríceps',
};
// mejor lugar para pararse, para el aviso cuando no se puede medir nada
export const FAMILY_VIEW_HINT: Record<Family, string> = {
  squat: 'de frente o de costado', lunge: 'de costado', hinge: 'de costado', curl: 'de costado', press: 'de costado',
  raise: 'de frente', row: 'de costado', pullup: 'de frente o de espaldas', pushup: 'de costado', dip: 'de costado',
  triceps: 'de costado',
};

// ----------------------------------------------------------------- familia por nombre
type Flags = { rdl?: boolean; stepup?: boolean; fixedArm?: boolean; noLine?: boolean; kipping?: boolean; noChin?: boolean; noLean?: boolean };
export type FormTarget = { family: Family; flags: Flags };

const T = (s: string) => new RegExp(s, 'i');
const RULES: [Family, RegExp][] = [
  ['pushup', T('\\b(push[- ]?ups?|pushups|flexi[oó]n(es)?|lagartijas)\\b')],
  ['dip', T('\\b(dips?|fondos)\\b')],
  ['pullup', T('\\b(pull[- ]?ups?|pullups|chin[- ]?ups?|chins?|dominadas?|muscle[- ]?ups?)\\b')],
  ['triceps', T('\\b(pushdowns?|kickbacks?|triceps|tricep|tr[ií]ceps)\\b')],
  ['curl', T('\\b(curls?|hammer|martillo)\\b')],
  ['raise', T('\\b(lateral raises?|side laterals?|front raises?|elevaci[oó]n(es)? (laterales?|frontales?))\\b')],
  ['row', T('\\b(rows?|remo)\\b')],
  ['press', T('\\b(press|militar)\\b')],
  ['hinge', T('\\b(deadlifts?|peso muerto|romanian|rumano|stiff|good mornings?|buenos d[ií]as|swings?)\\b')],
  ['lunge', T('\\b(lunges?|estocadas?|zancadas?|split squat|step[- ]?ups?|subidas? al caj[oó]n|b[uú]lgara)\\b')],
  ['squat', T('\\b(squats?|sentadillas?|thrusters?)\\b')],
];

export function formTarget(e: CameraSupportInput | null | undefined): FormTarget | null {
  if (!e || !isCameraSupported(e)) return null;
  const t = `${e.name ?? ''} ${e.name_es ?? ''}`;
  if (/\b(glute|gl[uú]teo|upright|ment[oó]n|clean|cargada|snatch|arranque|jerk|env[ií]o|burpees?|jumping|stride|zancada cruzad)/i.test(t)
    && !/\b(press|deadlift|peso muerto|squat|sentadilla)\b/i.test(t)) return null;
  for (const [family, re] of RULES) {
    if (!re.test(t)) continue;
    const flags: Flags = {};
    if (family === 'hinge') flags.rdl = /\b(romanian|rumano|stiff|r[ií]gidas?|good mornings?|buenos d[ií]as)\b/i.test(t);
    if (family === 'lunge') flags.stepup = /\b(step[- ]?ups?|subidas?)\b/i.test(t);
    if (family === 'curl') flags.fixedArm = /\b(preacher|predicador|concentra\w*|incline|inclinado|spider|ara[ñn]a|overhead|high cable|polea alta|drag|arrastrado)\b/i.test(t);
    if (family === 'pushup') flags.noLine = /\b(pike|handstand|vertical)\b/i.test(t);
    if (family === 'pullup') { flags.kipping = /\bkipping\b/i.test(t); flags.noChin = /\bmuscle[- ]?ups?\b/i.test(t); }
    if (family === 'squat') flags.noLean = /\b(sissy|frankenstein|front|frontal|zercher|goblet)\b/i.test(t);
    return { family, flags };
  }
  return null;
}

// ----------------------------------------------------------------- chequeos
export type CheckDef = { id: string; family: Family; view: ViewNeed; what: string; cue: string; fix: string; joints: number[] };

const SH = [11, 12], EL = [13, 14], HIP = [23, 24], KN = [25, 26], EAR = [7, 8];
const C = (family: Family, id: string, view: ViewNeed, what: string, cue: string, fix: string, joints: number[]): CheckDef =>
  ({ id: `${family}.${id}`, family, view, what, cue, fix, joints });

export const CHECKS: CheckDef[] = [
  C('squat', 'depth', 'any', 'Profundidad: cadera vs. rodilla', 'Bajá un poco más', 'Llevá la cadera hasta la altura de las rodillas (muslos paralelos al piso).', [...HIP, ...KN]),
  C('squat', 'knees', 'front', 'Rodillas hacia adentro abajo', 'Rodillas para afuera', 'Empujá las rodillas hacia donde apuntan las puntas de los pies.', KN),
  C('squat', 'lean', 'side', 'Torso muy inclinado abajo', 'Pecho arriba', 'Mantené el pecho alto y el peso en los talones.', [...SH, ...HIP]),

  C('lunge', 'depth', 'side', 'Profundidad (ángulo de rodilla)', 'Bajá más', 'Bajá hasta que la rodilla de atrás casi toque el piso.', KN),
  C('lunge', 'torso', 'side', 'Torso inclinado', 'Torso derecho', 'Bajá vertical, con el pecho alto y el abdomen firme.', [...SH, ...HIP]),

  C('hinge', 'back', 'side', 'Espalda redondeada (aprox.: oreja-hombro-cadera)', 'Espalda recta', 'Sacá pecho y llevá los hombros atrás antes de bajar; la cadera va para atrás.', [...EAR, ...SH, ...HIP]),
  C('hinge', 'rdlKnees', 'side', 'Rodillas muy dobladas en rumano', 'Rodillas casi estiradas', 'En el rumano las rodillas apenas se doblan: el movimiento es la cadera yendo para atrás.', KN),
  C('hinge', 'lockout', 'side', 'No termina parado', 'Terminá bien parado', 'Arriba apretá los glúteos y quedá derecho, sin tirarte para atrás.', [...HIP, ...SH]),

  C('curl', 'elbows', 'any', 'Codos se van adelante o se abren', 'Codos quietos', 'Pegá los codos al cuerpo: que solo se mueva el antebrazo.', [...SH, ...EL]),
  C('curl', 'swing', 'any', 'Balanceo del torso', 'No balancees el cuerpo', 'Bajá un poco el peso y mantené el torso quieto.', [...SH, ...HIP]),
  C('curl', 'bottom', 'any', 'No estira abajo', 'Estirá el brazo abajo', 'Bajá hasta estirar el brazo antes de la próxima.', EL),
  C('curl', 'top', 'any', 'No sube del todo', 'Subí hasta arriba', 'Subí hasta que la mano quede cerca del hombro.', EL),

  C('press', 'lockout', 'any', 'Brazos sin estirar arriba', 'Estirá los brazos arriba', 'Terminá con los codos estirados y el peso sobre la cabeza.', EL),
  C('press', 'lean', 'side', 'Espalda arqueada / torso inclinado', 'No arquees la espalda', 'Apretá glúteos y abdomen; si hace falta, bajá el peso.', [...SH, ...HIP]),
  C('press', 'depth', 'any', 'No baja', 'Bajá hasta el mentón', 'Bajá hasta que las manos queden a la altura del mentón.', EL),

  C('raise', 'high', 'any', 'Sube por encima de los hombros', 'No subas más que los hombros', 'Subí hasta la altura de los hombros y bajá controlando.', [...EL, 15, 16]),
  C('raise', 'low', 'any', 'No llega a la altura de los hombros', 'Subí hasta los hombros', 'Llevá las manos hasta la altura de los hombros.', [...EL, 15, 16]),
  C('raise', 'shrug', 'front', 'Encoge los hombros', 'Hombros abajo', 'Alejá los hombros de las orejas mientras subís.', [...EAR, ...SH]),
  C('raise', 'swing', 'any', 'Balanceo del torso', 'No balancees el cuerpo', 'Bajá un poco el peso y mantené el torso quieto.', [...SH, ...HIP]),

  C('row', 'swing', 'side', 'El torso sube y baja', 'Torso quieto', 'Fijá el torso inclinado; tirá con los brazos y la espalda, no con el envión.', [...SH, ...HIP]),
  C('row', 'upright', 'side', 'Torso muy parado', 'Inclinate más', 'Llevá la cadera atrás e inclinate hasta unos 45° o más.', [...SH, ...HIP]),
  C('row', 'range', 'side', 'Recorrido corto', 'Llevá los codos más atrás', 'Tirá hasta que la barra o las mancuernas toquen la panza.', EL),

  C('pullup', 'chin', 'any', 'Mentón no pasa la barra (nariz vs. manos)', 'Pasá el mentón de la barra', 'Subí hasta que el mentón quede arriba de las manos.', [0, 15, 16]),
  C('pullup', 'extend', 'any', 'No estira abajo', 'Estirá los brazos abajo', 'Bajá hasta casi estirar los brazos en cada rep.', EL),
  C('pullup', 'swing', 'side', 'Balanceo', 'No te balancees', 'Apretá abdomen y glúteos y subí sin envión.', [...SH, ...HIP]),

  C('pushup', 'sag', 'side', 'Cadera caída (hombro-cadera-tobillo)', 'Apretá el abdomen, no bajes la cadera', 'Cuerpo en línea recta de la cabeza a los talones: apretá abdomen y glúteos.', [...HIP, ...SH, 27, 28]),
  C('pushup', 'pike', 'side', 'Cadera muy alta', 'Bajá la cadera', 'Cuerpo en línea recta: la cadera ni arriba ni abajo.', [...HIP, ...SH, 27, 28]),
  C('pushup', 'depth', 'side', 'No baja lo suficiente', 'Bajá más', 'Bajá hasta que el pecho quede cerca del piso (codos a 90° o menos).', EL),
  C('pushup', 'lockout', 'side', 'No estira arriba', 'Estirá los brazos arriba', 'Arriba terminá con los brazos estirados.', EL),

  C('dip', 'depth', 'side', 'No baja lo suficiente', 'Bajá hasta 90°', 'Bajá hasta que el codo forme un ángulo recto.', EL),
  C('dip', 'lockout', 'any', 'No estira arriba', 'Estirá los brazos arriba', 'Arriba terminá con los brazos estirados.', EL),
  C('dip', 'flare', 'front', 'Codos abiertos', 'Codos cerca del cuerpo', 'Apuntá los codos para atrás, no para los costados.', EL),

  C('triceps', 'range', 'any', 'No estira del todo', 'Estirá del todo el brazo', 'Terminá cada rep con el codo estirado.', EL),
  C('triceps', 'elbows', 'any', 'El brazo se mueve (codo no fijo)', 'Codos quietos', 'Dejá el codo fijo: que solo se mueva el antebrazo.', [...SH, ...EL]),
  C('triceps', 'swing', 'any', 'Usa el cuerpo', 'No uses el cuerpo', 'Mantené el torso quieto y bajá un poco el peso.', [...SH, ...HIP]),
];
const CHECK = Object.fromEntries(CHECKS.map((c) => [c.id, c])) as Record<string, CheckDef>;

// ----------------------------------------------------------------- geometría
type Frame = { t: number; x: Float32Array; y: Float32Array; ok: Uint8Array };
type P = { x: number; y: number } | null;
const ALPHA = 0.55;
const KEEP_MS = 9000;
const MAX_REP_MS = 7000;

const get = (f: Frame, i: number): P => (f.ok[i] ? { x: f.x[i]!, y: f.y[i]! } : null);
const d = (a: P, b: P) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null);
function ang(a: P, b: P, c: P): number | null {
  if (!a || !b || !c) return null;
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n < 1e-9) return null;
  return (Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / n))) * 180) / Math.PI;
}
const mid = (a: P, b: P): P => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a ?? b);
const mean = (v: (number | null)[]) => { const o = v.filter((x): x is number => x != null); return o.length ? o.reduce((s, x) => s + x, 0) / o.length : null; };
const maxN = (v: (number | null)[]) => { const o = v.filter((x): x is number => x != null); return o.length ? Math.max(...o) : null; };
const minN = (v: (number | null)[]) => { const o = v.filter((x): x is number => x != null); return o.length ? Math.min(...o) : null; };

// índices por lado: 0 = izquierdo, 1 = derecho
const S = [
  { ear: 7, sh: 11, el: 13, wr: 15, hip: 23, kn: 25, an: 27 },
  { ear: 8, sh: 12, el: 14, wr: 16, hip: 24, kn: 26, an: 28 },
];
type Side = 0 | 1;
const torso = (f: Frame) => mean([d(get(f, 11), get(f, 23)), d(get(f, 12), get(f, 24))]);
// inclinación del torso respecto de la vertical (grados, con signo): cadera → hombro
function lean(f: Frame, side: Side | null): number | null {
  const sh = side == null ? mid(get(f, 11), get(f, 12)) : get(f, S[side]!.sh);
  const hip = side == null ? mid(get(f, 23), get(f, 24)) : get(f, S[side]!.hip);
  if (!sh || !hip) return null;
  return (Math.atan2(sh.x - hip.x, hip.y - sh.y) * 180) / Math.PI;
}

// extremos robustos: descarta el 8 % de cada punta
function lo(v: number[]) { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.08))]!; }
function hi(v: number[]) { const s = [...v].sort((a, b) => a - b); return s[Math.max(0, s.length - 1 - Math.floor(s.length * 0.08))]!; }
function median(v: number[]) { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; }
const MIN_FRAMES = 6;

// ----------------------------------------------------------------- resultado
export type RepResult = { status: 'ok' | 'fix' | 'unknown'; view: View; check?: CheckDef; cue: string; joints: number[]; measured: string[] };
export type FormSummary = {
  good: number; rated: number; total: number;
  top?: { id: string; cue: string; fix: string; count: number };
  text: string;           // "7 de 8 reps bien"
  line?: string;          // "Lo que más se repitió: «…». …"
};

export class FormChecker {
  private frames: Frame[] = [];
  private prev: Frame | null = null;
  private repStart = -Infinity;
  private results: RepResult[] = [];
  constructor(readonly target: FormTarget | null) {}

  reset() { this.frames = []; this.prev = null; this.repStart = -Infinity; this.results = []; }
  /** arrancó una serie: las reps se miden desde acá */
  beginSet(t: number) { this.repStart = t; this.results = []; }

  push(points: number[], w: number, h: number, t: number) {
    if (!this.target || points.length < 99 || w <= 0 || h <= 0) return;
    const aspect = w / h;
    const x = new Float32Array(33), y = new Float32Array(33), ok = new Uint8Array(33);
    const p = this.prev;
    for (let i = 0; i < 33; i++) {
      const px = points[i * 3] ?? 0, py = (points[i * 3 + 1] ?? 0) / aspect, c = points[i * 3 + 2] ?? 0;
      ok[i] = c >= VIS ? 1 : 0;
      if (p && p.ok[i] && ok[i]) { x[i] = p.x[i]! + ALPHA * (px - p.x[i]!); y[i] = p.y[i]! + ALPHA * (py - p.y[i]!); }
      else { x[i] = px; y[i] = py; }
    }
    const f: Frame = { t, x, y, ok };
    this.prev = f;
    this.frames.push(f);
    while (this.frames.length && t - this.frames[0]!.t > KEEP_MS) this.frames.shift();
  }

  /** el contador marcó una rep en t: evalúa los cuadros de esa rep */
  endRep(t: number): RepResult | null {
    if (!this.target) return null;
    const from = Math.max(this.repStart, t - MAX_REP_MS);
    const fr = this.frames.filter((f) => f.t > from && f.t <= t);
    this.repStart = t;
    const r = evaluate(this.target, fr);
    this.results.push(r);
    return r;
  }

  summary(totalReps: number): FormSummary | null {
    if (!this.target) return null;
    const rated = this.results.filter((r) => r.status !== 'unknown');
    const good = rated.filter((r) => r.status === 'ok').length;
    const total = Math.max(totalReps, this.results.length);
    if (!rated.length) {
      if (!total) return null;
      return { good: 0, rated: 0, total, text: 'No te vi bien para corregir',
        line: `Para las correcciones ponete ${FAMILY_VIEW_HINT[this.target.family]}, con todo el cuerpo en cuadro.` };
    }
    const counts = new Map<string, number>();
    for (const r of rated) if (r.check) counts.set(r.check.id, (counts.get(r.check.id) ?? 0) + 1);
    let top: FormSummary['top'];
    for (const [id, count] of counts) if (!top || count > top.count) top = { id, count, cue: CHECK[id]!.cue, fix: CHECK[id]!.fix };
    const text = rated.length < total ? `${good} de ${rated.length} reps bien (de las que pude ver)` : `${good} de ${rated.length} reps bien`;
    return { good, rated: rated.length, total, top, text,
      line: top ? `Lo que más se repitió: «${top.cue}». ${top.fix}` : 'Técnica prolija. Seguí así.' };
  }
}

// vista por ancho de hombros / largo de torso (de frente ~0,6–0,9; de costado <0,3)
function viewOf(fr: Frame[]): View {
  const r: number[] = [];
  for (const f of fr) {
    const sw = d(get(f, 11), get(f, 12)), tl = torso(f);
    if (sw != null && tl != null && tl > 0.02) r.push(sw / tl);
  }
  if (r.length < MIN_FRAMES) return 'unknown';
  const m = median(r);
  return m > 0.45 ? 'front' : m < 0.3 ? 'side' : 'unknown';
}

// de costado se usa el lado que mejor se ve
function bestSide(fr: Frame[]): Side {
  let a = 0, b = 0;
  for (const f of fr) for (const k of ['sh', 'el', 'wr', 'hip', 'kn', 'an'] as const) { a += f.ok[S[0]![k]]!; b += f.ok[S[1]![k]]!; }
  return b > a ? 1 : 0;
}

/** serie de valores por cuadro; null si no alcanzan los cuadros medibles */
function ser(fr: Frame[], fn: (f: Frame) => number | null): number[] | null {
  const out: number[] = [];
  for (const f of fr) { const v = fn(f); if (v != null && Number.isFinite(v)) out.push(v); }
  return out.length >= MIN_FRAMES && out.length >= fr.length * 0.5 ? out : null;
}
/** cuadros del extremo (ej. el 25 % más bajo de la rep), según una señal */
function extremeFrames(fr: Frame[], fn: (f: Frame) => number | null, top: boolean, frac = 0.25): Frame[] {
  const v = fr.map((f) => ({ f, v: fn(f) })).filter((x): x is { f: Frame; v: number } => x.v != null);
  v.sort((a, b) => (top ? b.v - a.v : a.v - b.v));
  return v.slice(0, Math.max(3, Math.ceil(v.length * frac))).map((x) => x.f);
}

type Ctx = { fr: Frame[]; view: View; side: Side | null; flags: Flags };
type Test = (c: Ctx) => boolean | null; // true = hay que corregir, false = bien, null = no se pudo medir

// helpers por lado (side=null: promedio / ambos)
const elbowAng = (f: Frame, s: Side) => ang(get(f, S[s]!.sh), get(f, S[s]!.el), get(f, S[s]!.wr));
const kneeAng = (f: Frame, s: Side) => ang(get(f, S[s]!.hip), get(f, S[s]!.kn), get(f, S[s]!.an));
const hipAng = (f: Frame, s: Side) => ang(get(f, S[s]!.sh), get(f, S[s]!.hip), get(f, S[s]!.kn));
const shAng = (f: Frame, s: Side) => ang(get(f, S[s]!.hip), get(f, S[s]!.sh), get(f, S[s]!.el));
const both = (fn: (f: Frame, s: Side) => number | null, pick: 'mean' | 'max' | 'min' = 'mean') => (side: Side | null) => (f: Frame) => {
  if (side != null) return fn(f, side);
  const v = [fn(f, 0), fn(f, 1)];
  return pick === 'max' ? maxN(v) : pick === 'min' ? minN(v) : mean(v);
};
// el brazo que más se movió (curl alternado, a una mano)
function activeArm(fr: Frame[], side: Side | null): Side | null {
  if (side != null) return side;
  const r = ([0, 1] as Side[]).map((s) => { const v = ser(fr, (f) => elbowAng(f, s)); return v ? hi(v) - lo(v) : -1; });
  if (r[0]! < 0 && r[1]! < 0) return null;
  return r[1]! > r[0]! ? 1 : 0;
}
const leanRange = (c: Ctx) => { const v = ser(c.fr, (f) => lean(f, c.side)); return v ? hi(v) - lo(v) : null; };
const yOf = (f: Frame, i: number) => (f.ok[i] ? f.y[i]! : null);
const ymid = (f: Frame, a: number, b: number) => mean([yOf(f, a), yOf(f, b)]);
const hipY = (f: Frame, side: Side | null) => (side == null ? ymid(f, 23, 24) : yOf(f, S[side]!.hip));
const kneeY = (f: Frame, side: Side | null) => (side == null ? ymid(f, 25, 26) : yOf(f, S[side]!.kn));
// muñeca sobre el hombro, en torsos (positivo = muñeca más arriba)
const wristAbove = (side: Side | null) => (f: Frame) => {
  const tl = torso(f); if (!tl) return null;
  const v = ([0, 1] as Side[]).filter((s) => side == null || s === side).map((s) => {
    const sh = get(f, S[s]!.sh), wr = get(f, S[s]!.wr);
    return sh && wr ? (sh.y - wr.y) / tl : null;
  });
  return maxN(v);
};
const elbowSeries = (c: Ctx) => { const s = activeArm(c.fr, c.side); return s == null ? null : ser(c.fr, (f) => elbowAng(f, s)); };

const TESTS: Record<string, Test> = {
  // --- sentadilla
  'squat.depth': ({ fr, side }) => {
    const v = ser(fr, (f) => { const h = hipY(f, side), k = kneeY(f, side), tl = torso(f); return h != null && k != null && tl ? (k - h) / tl : null; });
    if (!v) return null;
    const top = hi(v); if (top < 0.35) return null; // no se ve bien el muslo
    return lo(v) / top > 0.45;
  },
  'squat.knees': ({ fr }) => {
    const bottom = extremeFrames(fr, (f) => hipY(f, null), true);
    const v = ser(bottom, (f) => { const k = d(get(f, 25), get(f, 26)), a = d(get(f, 27), get(f, 28)); return k != null && a != null && a > 0.01 ? k / a : null; });
    if (!v || bottom.length < 3) return null;
    return median(v) < 0.8;
  },
  'squat.lean': ({ fr, side, flags }) => {
    if (flags.noLean) return null;
    const bottom = extremeFrames(fr, (f) => hipY(f, side), true);
    const v = bottom.map((f) => lean(f, side)).filter((x): x is number => x != null);
    if (v.length < 3) return null;
    return Math.abs(median(v)) > 55;
  },
  // --- estocada
  'lunge.depth': ({ fr, flags }) => {
    if (flags.stepup) return null;
    const v = ser(fr, (f) => minN([kneeAng(f, 0), kneeAng(f, 1)]));
    return v ? lo(v) > 115 : null;
  },
  'lunge.torso': ({ fr, side }) => { const v = ser(fr, (f) => lean(f, side)); return v ? Math.max(Math.abs(lo(v)), Math.abs(hi(v))) > 30 : null; },
  // --- bisagra
  'hinge.back': ({ fr, side }) => {
    if (side == null) return null;
    const bottom = extremeFrames(fr, (f) => { const l = lean(f, side); return l == null ? null : Math.abs(l); }, true);
    const v = ser(bottom, (f) => ang(get(f, S[side]!.ear), get(f, S[side]!.sh), get(f, S[side]!.hip)));
    if (!v) return null;
    const leanMax = maxN(bottom.map((f) => { const l = lean(f, side); return l == null ? null : Math.abs(l); }));
    if (leanMax == null || leanMax < 30) return null; // no llegó a inclinarse: nada que medir
    return median(v) < 130;
  },
  'hinge.rdlKnees': ({ fr, side, flags }) => {
    if (!flags.rdl || side == null) return null;
    const v = ser(fr, (f) => kneeAng(f, side));
    return v ? lo(v) < 130 : null;
  },
  'hinge.lockout': ({ fr, side }) => {
    if (side == null) return null;
    const v = ser(fr, (f) => hipAng(f, side));
    return v ? hi(v) < 158 : null;
  },
  // --- curl
  'curl.elbows': ({ fr, side, view, flags }) => {
    if (flags.fixedArm) return null;
    const v = ser(fr, both(shAng, 'max')(side));
    return v ? hi(v) > (view === 'front' ? 35 : 40) : null;
  },
  'curl.swing': (c) => { const r = leanRange(c); return r == null ? null : r > 15; },
  'curl.bottom': (c) => { const v = elbowSeries(c); return v ? hi(v) < 145 : null; },
  'curl.top': (c) => { const v = elbowSeries(c); return v ? lo(v) > 85 : null; },
  // --- press
  'press.lockout': (c) => { const v = elbowSeries(c); return v ? hi(v) < 155 : null; },
  'press.lean': ({ fr, side }) => { const v = ser(fr, (f) => lean(f, side)); return v ? Math.max(Math.abs(lo(v)), Math.abs(hi(v))) > 20 : null; },
  'press.depth': (c) => { const v = elbowSeries(c); return v ? lo(v) > 110 : null; },
  // --- elevaciones
  'raise.high': ({ fr, side }) => { const v = ser(fr, wristAbove(side)); return v ? hi(v) > 0.25 : null; },
  'raise.low': ({ fr, side }) => { const v = ser(fr, wristAbove(side)); return v ? hi(v) < -0.25 : null; },
  'raise.shrug': ({ fr }) => {
    const ed = (f: Frame) => { const tl = torso(f); const e = ymid(f, 7, 8), s = ymid(f, 11, 12); return tl && e != null && s != null ? (s - e) / tl : null; };
    const up = ser(extremeFrames(fr, wristAbove(null), true), ed);
    const down = ser(extremeFrames(fr, wristAbove(null), false), ed);
    if (!up || !down || up.length < 3 || down.length < 3) return null;
    const base = median(down); if (base <= 0.05) return null;
    return median(up) / base < 0.75;
  },
  'raise.swing': (c) => { const r = leanRange(c); return r == null ? null : r > 15; },
  // --- remo
  'row.swing': (c) => { const r = leanRange(c); return r == null ? null : r > 15; },
  'row.upright': ({ fr, side }) => { const v = ser(fr, (f) => lean(f, side)); return v ? Math.abs(median(v)) < 25 : null; },
  'row.range': (c) => { const v = elbowSeries(c); return v ? lo(v) > 110 : null; },
  // --- dominadas
  'pullup.chin': ({ fr, flags }) => {
    if (flags.noChin) return null;
    const v = ser(fr, (f) => { const n = yOf(f, 0), w = ymid(f, 15, 16), tl = torso(f); return n != null && w != null && tl ? (n - w) / tl : null; });
    return v ? lo(v) > 0.05 : null;
  },
  'pullup.extend': (c) => { const v = ser(c.fr, both(elbowAng, 'max')(c.side)); return v ? hi(v) < 150 : null; },
  'pullup.swing': (c) => { if (c.flags.kipping) return null; const r = leanRange(c); return r == null ? null : r > 25; },
  // --- flexiones: cadera respecto de la línea hombro-tobillo (positivo = cadera abajo)
  'pushup.sag': (c) => { const v = lineOffsets(c); return v ? hi(v) > 0.2 : null; },
  'pushup.pike': (c) => { const v = lineOffsets(c); return v ? lo(v) < -0.25 : null; },
  'pushup.depth': (c) => { const v = elbowSeries(c); return v ? lo(v) > 105 : null; },
  'pushup.lockout': (c) => { const v = elbowSeries(c); return v ? hi(v) < 150 : null; },
  // --- fondos
  'dip.depth': (c) => { const v = elbowSeries(c); return v ? lo(v) > 100 : null; },
  'dip.lockout': (c) => { const v = ser(c.fr, both(elbowAng, 'max')(c.side)); return v ? hi(v) < 150 : null; },
  'dip.flare': ({ fr }) => {
    const bottom = extremeFrames(fr, (f) => ymid(f, 11, 12), true);
    const v = ser(bottom, (f) => { const e = d(get(f, 13), get(f, 14)), s = d(get(f, 11), get(f, 12)); return e != null && s != null && s > 0.01 ? e / s : null; });
    if (!v || bottom.length < 3) return null;
    return median(v) > 1.6;
  },
  // --- tríceps
  'triceps.range': (c) => { const v = elbowSeries(c); return v ? hi(v) < 150 : null; },
  'triceps.elbows': (c) => { const s = activeArm(c.fr, c.side); if (s == null) return null; const v = ser(c.fr, (f) => shAng(f, s)); return v ? hi(v) - lo(v) > 25 : null; },
  'triceps.swing': (c) => { const r = leanRange(c); return r == null ? null : r > 15; },
};

function lineOffsets({ fr, side, flags }: Ctx): number[] | null {
  if (flags.noLine || side == null) return null;
  return ser(fr, (f) => {
    const sh = get(f, S[side]!.sh), hip = get(f, S[side]!.hip), an = get(f, S[side]!.an), tl = torso(f);
    if (!sh || !hip || !an || !tl) return null;
    const dx = an.x - sh.x;
    if (Math.abs(dx) < Math.abs(an.y - sh.y)) return null; // cuerpo no horizontal: no es una flexión vista de costado
    const yLine = sh.y + ((hip.x - sh.x) / dx) * (an.y - sh.y);
    return (hip.y - yLine) / tl;
  });
}

export function evaluate(target: FormTarget, fr: Frame[]): RepResult {
  const view = viewOf(fr);
  const side: Side | null = view === 'side' ? bestSide(fr) : null;
  const ctx: Ctx = { fr, view, side, flags: target.flags };
  const measured: string[] = [];
  for (const c of CHECKS) {
    if (c.family !== target.family) continue;
    if (c.view !== 'any' && c.view !== view) continue;
    const bad = fr.length >= MIN_FRAMES ? TESTS[c.id]?.(ctx) ?? null : null;
    if (bad == null) continue;
    measured.push(c.id);
    if (bad) return { status: 'fix', view, check: c, cue: c.cue, joints: c.joints, measured };
  }
  if (!measured.length) return { status: 'unknown', view, cue: 'No te veo bien', joints: [], measured };
  return { status: 'ok', view, cue: 'Bien', joints: [], measured };
}
