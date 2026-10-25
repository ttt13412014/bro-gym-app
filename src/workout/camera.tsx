// Modo cámara: vista previa chica + esqueleto, estado y reps en vivo.
// Todo corre en el teléfono (ML Kit): no se guardan ni se suben imágenes.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Alert, Animated, Linking, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Camera } from 'expo-camera';
import { fonts, gutter, line, radius, space } from '@/theme';
import { Text, haptic, makeStyles, reduceMotion, useRipple, useTheme } from '@/ui';
import { BroPoseView, hasCamera, poseAvailable, type PoseFrame } from '../../modules/bro-pose';
import { CUE_FIX, CUE_OK, FormChecker, type FormSummary, type FormTarget, type RepResult } from './formCheck';
import { MotionDetector, SKELETON, VIS, extract, type Phase } from './poseMotion';

export const cameraModeAvailable = () => poseAvailable() && hasCamera();

// Pide el permiso explicando para qué. true = se puede prender.
export async function askCameraPermission(): Promise<boolean> {
  try {
    const cur = await Camera.getCameraPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) { deniedForever(); return false; }
    const ok = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Modo cámara',
        'Bro? usa la cámara para ver tus movimientos, contar las reps y arrancar el descanso solo cuando parás.\n\n'
        + 'Todo se procesa en el teléfono: no se guardan ni se suben fotos ni videos.',
        [
          { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Seguir', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
    if (!ok) return false;
    const res = await Camera.requestCameraPermissionsAsync();
    if (res.granted) return true;
    if (!res.canAskAgain) deniedForever();
    else Alert.alert('Sin permiso de cámara', 'El modo cámara queda apagado. Podés seguir cargando las series a mano.');
    return false;
  } catch {
    Alert.alert('No se pudo abrir la cámara', 'Podés seguir cargando las series a mano.');
    return false;
  }
}

function deniedForever() {
  Alert.alert(
    'La cámara está bloqueada',
    'Para usar el modo cámara, habilitá el permiso de Cámara para Bro? en los ajustes del teléfono. Mientras tanto, cargá las series a mano.',
    [
      { text: 'Ahora no', style: 'cancel' },
      { text: 'Abrir ajustes', onPress: () => { Linking.openSettings().catch(() => {}); } },
    ],
  );
}

// Íconito de cámara para marcar ejercicios que el modo cámara cuenta (Biblioteca, pestaña Cámara)
export function CameraBadge({ size = 18 }: { size?: number }) {
  const { colors } = useTheme();
  const c = colors.textSecondary;
  return (
    <View accessible accessibilityLabel="La cámara cuenta este ejercicio"
      style={{ width: size + 12, height: size + 8, alignItems: 'center', justifyContent: 'center',
        borderWidth: line, borderColor: colors.line, borderRadius: radius.md }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M8.5 6 L10 4 H14 L15.5 6" stroke={c} strokeWidth={1.8} fill="none" strokeLinejoin="round" />
        <Rect x={3} y={6} width={18} height={13} rx={2} stroke={c} strokeWidth={1.8} fill="none" />
        <Circle cx={12} cy={12.5} r={3.6} stroke={c} strokeWidth={1.8} fill="none" />
      </Svg>
    </View>
  );
}

// "Correcciones" prendido/apagado: vale para toda la app mientras está abierta (arranca prendido)
let correctionsPref = true;

const STATUS: Record<Phase, string> = {
  nobody: 'Detectando…',
  ready: 'Listo · arrancá',
  moving: 'Moviéndote',
  stopped: 'Paraste — descanso',
};

type Props = {
  exerciseName: string;
  enabled: boolean;                 // false: ejercicio por tiempo (no se cuenta)
  armed: boolean;                   // false: esperando que se cargue la serie que terminó
  restActive: boolean;              // hay una barra de descanso debajo (no se suma el margen de abajo)
  onSetEnd: (reps: number, form: FormSummary | null) => void;
  formTarget?: FormTarget | null;   // familia para las correcciones de técnica (null: solo cuenta)
  onRearm: () => void;              // "Otra serie": descarta la espera y vuelve a contar
  onClose: () => void;
  disabledText?: string;            // por qué no se cuenta (si enabled=false)
  stoppedHint?: string;             // texto cuando paraste (por defecto: el de la sesión)
  rearmLabel?: string;              // texto del link para volver a contar
};

export function CameraDock(p: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const ripple = useRipple();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [phase, setPhase] = useState<Phase>('nobody');
  const [reps, setReps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const det = useRef(new MotionDetector()).current;
  const [corrections, setCorrections] = useState(correctionsPref);
  const checker = useRef<FormChecker | null>(null);
  const targetKey = useRef('');
  const tk = JSON.stringify(p.formTarget ?? null);
  if (!checker.current || targetKey.current !== tk) { checker.current = new FormChecker(p.formTarget ?? null); targetKey.current = tk; }
  const [cue, setCue] = useState<RepResult | null>(null);
  const [summary, setSummary] = useState<FormSummary | null>(null);
  const cueAnim = useRef(new Animated.Value(1)).current;
  const lastPhase = useRef<Phase>('nobody');
  const formOn = corrections && !!p.formTarget;
  const skel = useRef<SkeletonHandle>(null);
  const pulse = useRef(new Animated.Value(1)).current;
  const cb = useRef(p); cb.current = p;
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // se cargó la serie (o tocó "Otra serie"): vuelve a contar desde cero
  const wasArmed = useRef(p.armed);
  useEffect(() => {
    if (p.armed && !wasArmed.current) { det.rearm(); setReps(0); setPhase(det.phase); setCue(null); setSummary(null); }
    wasArmed.current = p.armed;
  }, [p.armed]);

  // ejercicio nuevo o cámara girada: arranca de cero
  useEffect(() => {
    det.reset(); checker.current?.reset(); setReps(0); setPhase('nobody'); setCue(null); setSummary(null); skel.current?.set(null);
  }, [facing, p.exerciseName]);

  function showCue(r: RepResult) {
    setCue(r);
    if (r.status === 'fix') skel.current?.flag(r.joints);
    if (reduceMotion()) { cueAnim.setValue(1); return; }
    cueAnim.setValue(0);
    Animated.spring(cueAnim, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 8 }).start();
  }

  function onPose(f: PoseFrame) {
    if (!alive.current) return;
    skel.current?.set(f);
    if (!cb.current.enabled) return;
    const ck = checker.current;
    ck?.push(f.points, f.w, f.h, f.t);
    const u = det.push(extract(f.points, f.w, f.h, f.t));
    if (u.phase === 'moving' && lastPhase.current !== 'moving') ck?.beginSet(det.startedAt);
    lastPhase.current = u.phase;
    if (u.phase !== phaseRef.current) { phaseRef.current = u.phase; setPhase(u.phase); }
    if (u.reps !== repsRef.current) { repsRef.current = u.reps; setReps(u.reps); }
    const r = u.rep && formOnRef.current ? ck?.endRep(f.t) ?? null : null;
    if (u.rep) {
      // corrección: vibración distinta (aviso) en vez del toquecito de cada rep
      if (r?.status === 'fix') haptic.warn(); else haptic.tap();
      if (r && (r.status !== 'unknown' || u.reps === 1)) showCue(r);
      if (!reduceMotion()) {
        pulse.setValue(1.18);
        Animated.spring(pulse, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
      }
    }
    if (u.ended) {
      haptic.success();
      const sum = formOnRef.current ? ck?.summary(u.ended.reps) ?? null : null;
      setSummary(sum);
      cb.current.onSetEnd(u.ended.reps, sum);
    }
  }
  const phaseRef = useRef<Phase>('nobody');
  const formOnRef = useRef(formOn); formOnRef.current = formOn;
  function toggleCorrections() {
    haptic.select();
    correctionsPref = !corrections;
    setCorrections(correctionsPref);
    if (!correctionsPref) { setCue(null); setSummary(null); skel.current?.flag([]); }
  }
  const repsRef = useRef(0);

  if (!BroPoseView) return null;
  const Native = BroPoseView;
  const showReps = p.enabled && (phase === 'moving' || phase === 'stopped');
  const hint = !p.enabled
    ? p.disabledText ?? 'Este ejercicio es por tiempo: la cámara no lo cuenta. Cargalo a mano.'
    : phase === 'nobody'
      ? 'Apoyá el teléfono a 2-3 m y alejate: tiene que verse todo tu cuerpo, de la cabeza a los pies.'
      : phase === 'ready'
        ? 'Te veo. Cuando arranques cuento las reps; si parás unos segundos arranca el descanso.'
        : phase === 'stopped'
          ? `${summary && formOn ? `${summary.text}. ` : ''}${p.stoppedHint ?? 'Revisá las reps y tocá Hecho. La próxima serie se cuenta después.'}`
          : 'Contando. Quedate en cuadro.';

  return (
    <View style={[styles.dock, { paddingBottom: (p.restActive ? 0 : insets.bottom) + space.md }]}>
      <View style={styles.band}>
        <View style={[styles.bar, { backgroundColor: colors.accent }]} />
        <Text variant="body" style={styles.bandText} numberOfLines={1}>CÁMARA</Text>
        {p.formTarget ? (
          <Pressable onPress={toggleCorrections} android_ripple={ripple} hitSlop={8} style={[styles.bandBtn, styles.toggle]}
            accessibilityRole="switch" accessibilityState={{ checked: corrections }}
            accessibilityLabel="Correcciones de técnica">
            <View style={[styles.box, corrections && { backgroundColor: colors.text, borderColor: colors.text }]} />
            <Text variant="label" style={{ color: corrections ? colors.text : colors.textDisabled }}>Correcciones</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => { haptic.select(); setFacing(facing === 'front' ? 'back' : 'front'); }}
          android_ripple={ripple} hitSlop={8} style={styles.bandBtn}
          accessibilityRole="button" accessibilityLabel={facing === 'front' ? 'Usar la cámara de atrás' : 'Usar la cámara de adelante'}>
          <Text variant="label" style={{ color: colors.text }}>Girar</Text>
        </Pressable>
        <Pressable onPress={() => { haptic.select(); p.onClose(); }} android_ripple={ripple} hitSlop={8} style={styles.bandBtn}
          accessibilityRole="button" accessibilityLabel="Apagar el modo cámara">
          <Text variant="label" style={{ color: colors.text }}>Apagar</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <View style={styles.preview}>
          {error ? (
            <Pressable style={styles.errBox} onPress={() => { haptic.select(); setError(null); setAttempt(attempt + 1); }}
              accessibilityRole="button" accessibilityLabel="Reintentar la cámara">
              <Text variant="small" style={{ textAlign: 'center', color: colors.text }}>Sin cámara</Text>
              <Text variant="label" style={{ marginTop: space.xs, color: colors.text }}>Reintentar</Text>
            </Pressable>
          ) : (
            <>
              <Native
                key={`${facing}-${attempt}`}
                style={{ flex: 1 }}
                facing={facing}
                active
                onPose={(e) => onPose(e.nativeEvent)}
                onPoseError={(e) => {
                  const m = e.nativeEvent.message;
                  setError(m === 'no-camera' ? 'no-camera' : 'error');
                  haptic.warn();
                }}
              />
              <Skeleton ref={skel} color={colors.accent} />
            </>
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={[styles.chip, phase === 'moving' && { backgroundColor: colors.text, borderColor: colors.text }]}
            accessibilityLiveRegion="polite" accessibilityLabel={`Estado: ${p.enabled ? STATUS[phase] : p.disabledText ? 'No compatible' : 'Por tiempo'}`}>
            <Text variant="label" numberOfLines={1} style={{ color: phase === 'moving' ? colors.bg : colors.text }}>
              {p.enabled ? STATUS[phase] : p.disabledText ? 'No compatible' : 'Por tiempo'}
            </Text>
          </View>
          <View style={styles.repsRow} accessibilityLabel={`${reps} repeticiones`}>
            <Animated.Text
              style={[styles.reps, { color: showReps ? colors.text : colors.textDisabled, transform: [{ scale: pulse }] }]}
              numberOfLines={1}>
              {showReps ? reps : 0}
            </Animated.Text>
            <Text variant="label" style={{ marginLeft: space.sm, marginBottom: 12 }}>reps</Text>
          </View>
          {cue && formOn ? (
            <Animated.View
              accessibilityLiveRegion="polite" accessibilityLabel={`Técnica: ${cue.cue}`}
              style={[styles.cue, {
                borderColor: cue.status === 'ok' ? CUE_OK : cue.status === 'fix' ? CUE_FIX : colors.line,
                backgroundColor: cue.status === 'ok' ? `${CUE_OK}22` : cue.status === 'fix' ? `${CUE_FIX}22` : 'transparent',
                opacity: cueAnim, transform: [{ scale: cueAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
              }]}>
              <View style={[styles.dot, { backgroundColor: cue.status === 'ok' ? CUE_OK : cue.status === 'fix' ? CUE_FIX : colors.textDisabled }]} />
              <Text variant="small" numberOfLines={2} style={{ color: colors.text, flexShrink: 1 }}>
                {cue.status === 'unknown' ? 'No te veo bien para corregir' : cue.cue}
              </Text>
            </Animated.View>
          ) : (
            <Text variant="small" numberOfLines={1} style={{ color: colors.text }}>{p.exerciseName}</Text>
          )}
        </View>
      </View>

      <Text variant="small" style={{ marginTop: space.sm }}>
        {error ? (error === 'no-camera'
          ? 'Este teléfono no tiene una cámara disponible. Cargá las series a mano.'
          : 'No se pudo abrir la cámara. Cerrá otras apps que la estén usando y tocá Reintentar.') : hint}
      </Text>
      {p.enabled && phase === 'stopped' && !p.armed ? (
        <Pressable onPress={() => { haptic.select(); p.onRearm(); }} hitSlop={8} accessibilityRole="button" style={{ marginTop: space.xs, alignSelf: 'flex-start' }}>
          <Text variant="label" style={{ color: colors.text }}>{p.rearmLabel ?? 'Contar otra serie sin cargar esta'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ----------------------------------------------------------------- esqueleto (se dibuja solo él, no toda la sesión)
type SkeletonHandle = { set: (f: PoseFrame | null) => void; flag: (joints: number[]) => void };
const FLAG_MS = 1400;
const Skeleton = forwardRef<SkeletonHandle, { color: string }>(function Skeleton({ color }, ref) {
  const [f, setF] = useState<PoseFrame | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // articulaciones a corregir: se pintan naranja un momento
  const [flagged, setFlagged] = useState<Set<number>>(() => new Set());
  const flagTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flagTimer.current) clearTimeout(flagTimer.current); }, []);
  useImperativeHandle(ref, () => ({
    set: setF,
    flag: (joints: number[]) => {
      if (flagTimer.current) clearTimeout(flagTimer.current);
      setFlagged(new Set(joints));
      if (joints.length) flagTimer.current = setTimeout(() => setFlagged(new Set()), FLAG_MS);
    },
  }), []);
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  let body = null;
  if (f && f.points.length >= 99 && size.w > 0 && f.w > 0 && f.h > 0) {
    // la vista previa llena el recuadro (recorta los bordes): misma cuenta para los puntos
    const s = Math.max(size.w / f.w, size.h / f.h);
    const dw = f.w * s, dh = f.h * s, ox = (size.w - dw) / 2, oy = (size.h - dh) / 2;
    const P = (i: number) => {
      const x = f.points[i * 3] ?? 0, y = f.points[i * 3 + 1] ?? 0, c = f.points[i * 3 + 2] ?? 0;
      return { x: ox + (f.mirrored ? 1 - x : x) * dw, y: oy + y * dh, ok: c >= VIS };
    };
    const pts = Array.from({ length: 33 }, (_, i) => P(i));
    body = (
      <>
        {SKELETON.map(([a, b], i) => {
          const A = pts[a]!, B = pts[b]!;
          const bad = flagged.has(a) || flagged.has(b);
          return A.ok && B.ok ? <Line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={bad ? CUE_FIX : color} strokeWidth={bad ? 3.5 : 2} /> : null;
        })}
        {[0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map((i) => {
          const q = pts[i]!;
          const bad = flagged.has(i);
          if (i < 11 && !bad) return null; // cara: solo si hay que marcarla
          return q.ok ? <Circle key={i} cx={q.x} cy={q.y} r={bad ? 4 : 2.5} fill={bad ? CUE_FIX : '#FFFFFF'} /> : null;
        })}
      </>
    );
  }
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="none" onLayout={onLayout}>
      {size.w > 0 ? <Svg width={size.w} height={size.h}>{body}</Svg> : null}
    </View>
  );
});

const PREVIEW_W = 108;
const useStyles = makeStyles((colors) => ({
  dock: {
    backgroundColor: colors.surface, borderTopWidth: line, borderTopColor: colors.line,
    paddingHorizontal: gutter, paddingTop: space.md,
  },
  band: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 36, paddingRight: space.xs,
    backgroundColor: colors.bg, borderWidth: line, borderColor: colors.line, borderRadius: 6, overflow: 'hidden',
    marginBottom: space.md,
  },
  bar: { width: 4, alignSelf: 'stretch' },
  bandText: { color: colors.text, fontWeight: '700', letterSpacing: 1.2, flex: 1, minWidth: 0 },
  bandBtn: { paddingHorizontal: space.sm, minHeight: 32, justifyContent: 'center', borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  preview: {
    width: PREVIEW_W, height: (PREVIEW_W * 4) / 3, borderRadius: radius.md, overflow: 'hidden',
    backgroundColor: '#000000', borderWidth: line, borderColor: colors.line,
  },
  errBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.sm },
  chip: {
    alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: 6,
    borderWidth: line, borderColor: colors.line, borderRadius: 999,
  },
  repsRow: { flexDirection: 'row', alignItems: 'flex-end' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  box: { width: 12, height: 12, borderWidth: 1.5, borderColor: colors.textDisabled, borderRadius: 2 },
  cue: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%',
    paddingHorizontal: space.sm, paddingVertical: 4, borderWidth: line, borderRadius: 999,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  reps: { fontFamily: fonts.monoSemi, fontSize: 72, lineHeight: 80, letterSpacing: -2 },
}));
