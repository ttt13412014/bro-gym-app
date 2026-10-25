// Pruebas de las correcciones de técnica con cuerpos simulados (sin teléfono).
// Correr: npx esbuild scripts/formCheck.test.ts --bundle --platform=node --log-level=error | node
// Arma secuencias de los 33 puntos de ML Kit (15 cuadros/s, con ruido), las pasa por el mismo camino
// que el panel de la cámara (extract → MotionDetector → FormChecker) y compara con lo esperado.
import { FormChecker, formTarget, type FormSummary, type RepResult } from '../src/workout/formCheck';
import { MotionDetector, extract } from '../src/workout/poseMotion';

const W = 480, H = 640, FPS = 15;
type XY = { x: number; y: number };
type Pose = Partial<Record<number, XY>>;
const dir = (deg: number, len: number): XY => ({ x: Math.sin((deg * Math.PI) / 180) * len, y: -Math.cos((deg * Math.PI) / 180) * len });
const add = (a: XY, b: XY): XY => ({ x: a.x + b.x, y: a.y + b.y });
const lerp = (a: XY, b: XY, k: number): XY => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

// pose de costado: mismos puntos para izq/der (el de atrás un poco corrido y con menos confianza)
function sidePose(j: { ankle: XY; knee: XY; hip: XY; sh: XY; el: XY; wr: XY; ear: XY; nose: XY }): Pose {
  const p: Pose = { 0: j.nose };
  const pairs: [number, number, XY][] = [[7, 8, j.ear], [11, 12, j.sh], [13, 14, j.el], [15, 16, j.wr], [23, 24, j.hip], [25, 26, j.knee], [27, 28, j.ankle]];
  for (const [l, r, v] of pairs) { p[l] = v; p[r] = { x: v.x + 4, y: v.y }; }
  return p;
}
function toPoints(p: Pose, side: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < 33; i++) {
    const v = p[i];
    if (!v) { out.push(0, 0, 0.1); continue; }
    const far = side && i % 2 === 0 && i > 0; // lado derecho (índices pares) atrás
    out.push((v.x + gauss() * 1.2) / W, (v.y + gauss() * 1.2) / H, far ? 0.75 : 0.95);
  }
  return out;
}

// ----------------------------------------------------------------- modelos
const SHIN = 120, THIGH = 125, TORSO = 160, UPPER = 80, FORE = 75;
function squat(ph: number, o: { thigh: number; lean: number; front: boolean; kneeOut: number }) {
  const ankle = { x: 240, y: 600 };
  const knee = add(ankle, dir(30 * ph, SHIN));
  const hip = add(knee, dir(-o.thigh * ph, THIGH));
  const sh = add(hip, dir(o.lean * ph, TORSO));
  const el = add(sh, dir(160, 60)), wr = add(el, dir(20, 50));
  const ear = add(sh, add(dir(o.lean * ph, 35), { x: 8, y: 0 })), nose = add(sh, add(dir(o.lean * ph, 45), { x: 18, y: 0 }));
  if (!o.front) return sidePose({ ankle, knee, hip, sh, el, wr, ear, nose });
  const c = 240, P: Pose = { 0: { x: c, y: nose.y } };
  const set = (l: number, r: number, dx: number, y: number) => { P[l] = { x: c + dx, y }; P[r] = { x: c - dx, y }; };
  set(7, 8, 18, ear.y); set(11, 12, 60, sh.y); set(13, 14, 78, el.y); set(15, 16, 66, wr.y);
  set(23, 24, 35, hip.y); set(25, 26, 42 + o.kneeOut * ph, knee.y); set(27, 28, 48, ankle.y);
  return P;
}
function curl(ph: number, o: { flex: [number, number]; drift: number; swing: number }) {
  const ankle = { x: 240, y: 600 };
  const knee = add(ankle, dir(0, SHIN)), hip = add(knee, dir(0, THIGH));
  const t = -o.swing * ph, sh = add(hip, dir(t, TORSO));
  const arm = 180 - o.drift * ph + t, flex = o.flex[0] + (o.flex[1] - o.flex[0]) * ph;
  const el = add(sh, dir(arm, UPPER)), wr = add(el, dir(arm - flex, FORE));
  return sidePose({ ankle, knee, hip, sh, el, wr, ear: add(sh, dir(t + 8, 35)), nose: add(sh, dir(t + 20, 45)) });
}
function pushup(ph: number, o: { elbow: [number, number]; sag: number }) {
  const e = o.elbow[0] + (o.elbow[1] - o.elbow[0]) * ph; // ángulo interno del codo
  const wr = { x: 400, y: 600 };
  const h = Math.sqrt(UPPER ** 2 + FORE ** 2 - 2 * UPPER * FORE * Math.cos((e * Math.PI) / 180));
  const sh = { x: 400, y: 600 - h };
  const a = Math.acos((UPPER ** 2 + h ** 2 - FORE ** 2) / (2 * UPPER * h));
  const el = { x: sh.x - Math.sin(a) * UPPER, y: sh.y + Math.cos(a) * UPPER };
  const L = TORSO + SHIN + THIGH;
  const ankle = { x: 400 - Math.sqrt(L ** 2 - (590 - sh.y) ** 2), y: 590 };
  const u = { x: (ankle.x - sh.x) / L, y: (ankle.y - sh.y) / L };
  let n = { x: -u.y, y: u.x }; if (n.y < 0) n = { x: -n.x, y: -n.y };
  const hip = add(add(sh, { x: u.x * TORSO, y: u.y * TORSO }), { x: n.x * o.sag, y: n.y * o.sag });
  const knee = add(lerp(hip, ankle, 0.5), { x: n.x * o.sag * 0.5, y: n.y * o.sag * 0.5 });
  return sidePose({ ankle, knee, hip, sh, el, wr, ear: add(sh, { x: -u.x * 30, y: -u.y * 30 - 5 }), nose: add(sh, { x: -u.x * 42, y: -u.y * 42 }) });
}

// ----------------------------------------------------------------- corrida (mismo flujo que CameraDock)
function run(name: string, pose: (ph: number, rep: number) => Pose, reps: number, side: boolean, period = 2.4) {
  const target = formTarget({ name, name_es: null, category: 'strength', equipment: 'barbell', force: 'push' });
  const det = new MotionDetector(), ck = new FormChecker(target);
  const res: RepResult[] = []; let summary: FormSummary | null = null; let counted = 0;
  const frames: number[][] = [];
  for (let i = 0; i < 1.5 * FPS; i++) frames.push(toPoints(pose(0, 0), side));
  for (let i = 0; i < reps * period * FPS; i++) frames.push(toPoints(pose((1 - Math.cos((2 * Math.PI * i) / (period * FPS))) / 2, Math.floor(i / (period * FPS))), side));
  for (let i = 0; i < 4 * FPS; i++) frames.push(toPoints(pose(0, reps - 1), side));
  let prev = det.phase;
  frames.forEach((pts, i) => {
    const t = 1000 + (i * 1000) / FPS;
    ck.push(pts, W, H, t);
    const u = det.push(extract(pts, W, H, t));
    if (u.phase === 'moving' && prev !== 'moving') ck.beginSet(det.startedAt);
    prev = u.phase;
    if (u.rep) { const r = ck.endRep(t); if (r) res.push(r); }
    if (u.ended) { counted = u.ended.reps; summary = ck.summary(u.ended.reps); }
  });
  return { target, res, summary: summary as FormSummary | null, counted };
}

let pass = 0, fail = 0;
function expect(label: string, r: ReturnType<typeof run>, reps: number, want: string | 'ok') {
  const cues = r.res.map((x) => (x.status === 'fix' ? x.check!.id : x.status));
  const bad = cues.filter((c) => c !== 'ok').length;
  const okReps = cues.filter((c) => c === 'ok').length;
  const good = want === 'ok'
    ? r.counted === reps && okReps === reps
    : r.counted === reps && cues.filter((c) => c === want).length >= reps - 1 && r.summary?.top?.id === want;
  if (good) pass++; else fail++;
  console.log(`${good ? 'OK  ' : 'FALLA'} ${label.padEnd(44)} fam=${r.target?.family} vista=${r.res[0]?.view ?? '-'} reps=${r.counted}/${reps} ` +
    `bien=${okReps} corr=${bad} → ${r.summary?.text ?? '-'}${r.summary?.top ? ` · top=${r.summary.top.id}` : ''}`);
}

const N = 8;
expect('Sentadilla de costado, profunda', run('Barbell Squat', (p) => squat(p, { thigh: 100, lean: 35, front: false, kneeOut: 0 }), N, true), N, 'ok');
expect('Sentadilla de costado, corta', run('Barbell Squat', (p) => squat(p, { thigh: 50, lean: 25, front: false, kneeOut: 0 }), N, true), N, 'squat.depth');
expect('Sentadilla de costado, pecho caído', run('Barbell Squat', (p) => squat(p, { thigh: 100, lean: 72, front: false, kneeOut: 0 }), N, true), N, 'squat.lean');
expect('Sentadilla de frente, rodillas afuera', run('Barbell Squat', (p) => squat(p, { thigh: 100, lean: 30, front: true, kneeOut: 12 }), N, false), N, 'ok');
expect('Sentadilla de frente, rodillas adentro', run('Barbell Squat', (p) => squat(p, { thigh: 100, lean: 30, front: true, kneeOut: -26 }), N, false), N, 'squat.knees');
expect('Curl de costado, prolijo', run('Barbell Curl', (p) => curl(p, { flex: [10, 140], drift: 8, swing: 0 }), N, true), N, 'ok');
expect('Curl de costado, codos adelante', run('Barbell Curl', (p) => curl(p, { flex: [10, 140], drift: 55, swing: 0 }), N, true), N, 'curl.elbows');
expect('Curl de costado, balanceo', run('Barbell Curl', (p) => curl(p, { flex: [10, 140], drift: 8, swing: 22 }), N, true), N, 'curl.swing');
expect('Curl de costado, sin estirar abajo', run('Barbell Curl', (p) => curl(p, { flex: [45, 140], drift: 8, swing: 0 }), N, true), N, 'curl.bottom');
expect('Flexiones de costado, prolijas', run('Pushups', (p) => pushup(p, { elbow: [168, 75], sag: 4 }), N, true), N, 'ok');
expect('Flexiones de costado, cadera caída', run('Pushups', (p) => pushup(p, { elbow: [168, 75], sag: 60 }), N, true), N, 'pushup.sag');
expect('Flexiones de costado, cadera alta', run('Pushups', (p) => pushup(p, { elbow: [168, 75], sag: -70 }), N, true), N, 'pushup.pike');
expect('Flexiones de costado, medio recorrido', run('Pushups', (p) => pushup(p, { elbow: [168, 122], sag: 4 }), N, true), N, 'pushup.depth');

// tolerancia: casi perfecto no tiene que retar
expect('Sentadilla apenas sobre paralelo (tolerancia)', run('Goblet Squat', (p) => squat(p, { thigh: 72, lean: 30, front: false, kneeOut: 0 }), N, true), N, 'ok');
expect('Curl con un poco de codo (tolerancia)', run('Dumbbell Bicep Curl', (p) => curl(p, { flex: [15, 130], drift: 22, swing: 6 }), N, true), N, 'ok');
// por rep: reps pares bien, impares con el pecho caído → tiene que marcar justo esas
// (ojo: una rep MUCHO más corta que las otras ni siquiera la cuenta el contador; por eso acá se varía el torso)
{
  const r = run('Barbell Squat', (p, k) => squat(p, { thigh: 100, lean: k % 2 ? 72 : 30, front: false, kneeOut: 0 }), N, true);
  const got = r.res.map((x) => (x.status === 'ok' ? 'B' : x.status === 'fix' ? 'C' : '?')).join('');
  const ok = got === 'BCBCBCBC';
  ok ? pass++ : fail++;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${'Sentadilla alternando bien/pecho caído'.padEnd(44)} por rep=${got} (esperado BCBCBCBC) → ${r.summary?.text} · ${r.summary?.line}`);
}
// vista sin datos: flexiones de frente → no inventa
{
  const r2 = run('Pushups', (p) => { const q = pushup(p, { elbow: [168, 75], sag: 60 }); for (const k of [11, 12, 23, 24]) { const v = q[k]!; q[k] = { x: v.x + (k % 2 ? 70 : -70), y: v.y }; } return q; }, N, false);
  const unknown = r2.res.every((x) => x.status !== 'fix');
  unknown ? pass++ : fail++;
  console.log(`${unknown ? 'OK  ' : 'FALLA'} ${'Flexiones sin vista de costado (no reta)'.padEnd(44)} vista=${r2.res[0]?.view} estados=${r2.res.map((x) => x.status[0]).join('')} → ${r2.summary?.text}`);
}

console.log(`\n${pass} OK, ${fail} fallas`);
if (fail) (globalThis as { process?: { exitCode?: number } }).process!.exitCode = 1;
