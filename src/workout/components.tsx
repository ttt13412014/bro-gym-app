import { memo, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, gutter, line, radius, space } from '@/theme';
import { Button, Chip, ExerciseImage, Text, haptic, parseDecimal, rangeError } from '@/ui';
import { sanitizeNumeric } from '@/ui/feedback';
import { fmtKg, parseJson } from './data';
import { fmtClock, useCountdown } from './useRestTimer';
import { CUE_FIX, CUE_OK, type FormSummary } from './formCheck';
import { plateText } from './plates';
import { HelpDot, dimWhenPressed, IS_ANDROID, makeStyles, useRipple, useTheme } from '@/ui';

// ----------------------------------------------------------------- chips de esfuerzo
const RIR_OPTS = [0, 1, 2, 3, 4, 5];
const RPE_OPTS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

export type EffortMode = 'rir' | 'rpe';

// ----------------------------------------------------------------- carga de una serie
export type SetEntryProps = {
  label: string;                     // "Serie 3", "Drop 1"
  defaultWeight: number | null;
  defaultReps: number;
  defaultEffort: number | null;
  mode: EffortMode;
  onToggleMode: () => void;
  unit: 'reps' | 'sec';
  amrap?: boolean;
  barbell?: boolean;                 // muestra los discos por lado del peso que se está escribiendo
  confirmLabel?: string;
  // puede devolver una promesa: mientras guarda, el botón queda bloqueado (no se cargan series dobles)
  onConfirm: (v: { weightKg: number | null; reps: number; rir: number | null; rpe: number | null }) => unknown;
  onCancel?: () => void;
  // modo cámara: reps que contó la cámara al parar (null: nada; 0: se movió pero no pudo contar)
  cameraReps?: number | null;
  // correcciones de técnica de esa serie (orientativo; no cambia lo que se guarda)
  cameraForm?: FormSummary | null;
};

export function SetEntry(p: SetEntryProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [w, setW] = useState(p.defaultWeight != null ? fmtKg(p.defaultWeight) : '');
  const [r, setR] = useState(String(p.defaultReps));
  const [effort, setEffort] = useState<number | null>(p.defaultEffort);

  // la cámara contó la serie: se pone en Reps y se puede corregir con −1 / +1 o escribiendo
  useEffect(() => {
    if (p.cameraReps != null && p.cameraReps > 0 && p.unit === 'reps') setR(String(Math.min(100, p.cameraReps)));
  }, [p.cameraReps]);
  const nudge = (d: number) => {
    haptic.select();
    const cur = Number(r);
    setR(String(Math.max(1, Math.min(100, (Number.isFinite(cur) && cur > 0 ? cur : 0) + d))));
  };

  // topes de sentido común: nada de 2000 kg ni 300 reps por un dedo de más
  const repsMax = p.unit === 'sec' ? 600 : 100;
  const weightErr = rangeError(w, { min: 0, max: 500, label: 'Peso', unit: 'kg' });
  const repsErr = rangeError(r, {
    min: 1, max: repsMax, integer: true, required: true, label: p.unit === 'sec' ? 'Segundos' : 'Reps',
  });
  const error = weightErr ?? repsErr;
  const reps = Number(r);
  const valid = !error;

  function confirm() {
    if (!valid) { haptic.warn(); return; }
    return p.onConfirm({
      weightKg: parseDecimal(w),
      reps,
      rir: p.mode === 'rir' ? effort : null,
      rpe: p.mode === 'rpe' ? effort : null,
    });
  }

  return (
    <View style={styles.entry}>
      <View style={styles.entryHead}>
        <Text variant="label" style={{ color: colors.text, flexShrink: 1, marginRight: space.md }}>{p.label}{p.amrap ? ' · AMRAP' : ''}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 0 }}>
          <Pressable onPress={() => { p.onToggleMode(); setEffort(null); }} hitSlop={8}
            accessibilityRole="button" accessibilityLabel={`Cambiar a ${p.mode === 'rir' ? 'RPE' : 'RIR'}`}>
            <Text variant="label">
              <Text variant="label" style={p.mode === 'rir' ? { color: colors.text } : null}>RIR</Text>
              {'  /  '}
              <Text variant="label" style={p.mode === 'rpe' ? { color: colors.text } : null}>RPE</Text>
            </Text>
          </Pressable>
          {/* explica el que está elegido */}
          <HelpDot term={p.mode} />
        </View>
      </View>

      <View style={styles.inputs}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" numberOfLines={1}>Peso kg</Text>
          <TextInput
            value={w} onChangeText={(t) => setW(sanitizeNumeric(t, true))} keyboardType="decimal-pad" placeholder="—"
            accessibilityLabel="Peso en kilos"
            placeholderTextColor={colors.textDisabled} selectionColor={colors.text}
            style={styles.bigInput} selectTextOnFocus
          />
        </View>
        <Text variant="number" tone="disabled" style={{ alignSelf: 'flex-end', paddingBottom: space.md }}>×</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" numberOfLines={1}>{p.unit === 'sec' ? 'Segundos' : 'Reps'}</Text>
          <TextInput
            value={r} onChangeText={(t) => setR(sanitizeNumeric(t, false))} keyboardType="number-pad" maxLength={3}
            accessibilityLabel={p.unit === 'sec' ? 'Segundos' : 'Repeticiones'}
            placeholderTextColor={colors.textDisabled} selectionColor={colors.text}
            style={styles.bigInput} selectTextOnFocus
          />
        </View>
      </View>

      {p.cameraReps != null && p.unit === 'reps' ? (
        <View style={styles.camRow} accessibilityLiveRegion="polite">
          <Text variant="small" style={{ flex: 1, minWidth: 0, color: colors.text }}>
            {p.cameraReps > 0
              ? `La cámara contó ${p.cameraReps} ${p.cameraReps === 1 ? 'rep' : 'reps'}. Si no coincide, corregilo.`
              : 'La cámara no pudo contar las reps: escribilas vos.'}
          </Text>
          <Pressable onPress={() => nudge(-1)} hitSlop={6} style={styles.nudge} accessibilityRole="button" accessibilityLabel="Una rep menos">
            <Text variant="numberSm">−1</Text>
          </Pressable>
          <Pressable onPress={() => nudge(1)} hitSlop={6} style={styles.nudge} accessibilityRole="button" accessibilityLabel="Una rep más">
            <Text variant="numberSm">+1</Text>
          </Pressable>
        </View>
      ) : null}

      {p.cameraForm && p.unit === 'reps' ? <FormNote summary={p.cameraForm} /> : null}

      {p.barbell ? <PlateHint totalKg={parseDecimal(w)} /> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(p.mode === 'rir' ? RIR_OPTS : RPE_OPTS).map((v) => (
          <Chip
            key={v}
            mono
            label={p.mode === 'rir' && v === 5 ? '5+' : fmtKg(v)}
            selected={effort === v}
            onPress={() => setEffort(effort === v ? null : v)}
          />
        ))}
      </ScrollView>

      {error && (w.trim() || r.trim()) ? (
        <Text variant="small" style={{ color: colors.text, marginBottom: space.md }}>{error}</Text>
      ) : null}

      {/* único acento de la pantalla: confirmar la serie en curso */}
      <Button variant="primary" label={p.confirmLabel ?? 'Hecho'} onPress={confirm} disabled={!valid} />
      {p.onCancel ? (
        <Button variant="ghost" label="Cancelar" onPress={p.onCancel} style={{ marginTop: space.xs }} />
      ) : null}
    </View>
  );
}

// ----------------------------------------------------------------- discos por lado (barra olímpica 20 kg)
export function PlateHint({ totalKg, style }: { totalKg: number | null; style?: object }) {
  const { colors } = useTheme();
  const t = plateText(totalKg);
  if (!t) {
    return totalKg != null && totalKg > 0
      ? <Text variant="small" style={[{ marginTop: space.sm }, style]}>Menos que la barra (20 kg)</Text>
      : null;
  }
  return (
    <View style={[{ marginTop: space.sm }, style]} accessibilityLabel={`${t.head}. ${t.detail}`}>
      <Text variant="small" style={{ color: colors.text }}>{t.head}</Text>
      {t.detail ? <Text variant="small">Por lado: {t.detail}</Text> : null}
    </View>
  );
}

// ----------------------------------------------------------------- fila de serie hecha / pendiente
export function SetLine({
  index, weight, reps, unit, effort, state, child, onLongPress,
}: {
  index: string; weight: number | null; reps: number | null; unit: string;
  effort?: string | null; state: 'done' | 'pending'; child?: boolean; onLongPress?: () => void;
}) {
  const styles = useStyles();
  const dim = state === 'pending';
  const ripple = useRipple();
  return (
    <Pressable
      android_ripple={onLongPress ? ripple : undefined}
      onLongPress={onLongPress ? () => { haptic.tap(); onLongPress(); } : undefined}
      delayLongPress={450}
      disabled={!onLongPress}
      accessibilityHint={onLongPress ? 'Mantené apretado para borrar' : undefined}
      style={({ pressed }) => [styles.setLine, child && { paddingLeft: space.xl }, dimWhenPressed(pressed)]}
    >
      <Text variant="numberSm" tone={dim ? 'disabled' : 'secondary'} style={{ minWidth: 36, marginRight: space.xs }}>{index}</Text>
      <Text variant="numberSm" tone={dim ? 'disabled' : 'default'} style={{ flex: 1, minWidth: 0 }}>
        {weight != null ? `${fmtKg(weight)} kg` : '—'} × {reps ?? '—'}{unit === 'sec' ? ' s' : ''}
      </Text>
      {effort ? <Text variant="numberSm" tone="secondary" style={{ marginLeft: space.sm, flexShrink: 0 }}>{effort}</Text> : null}
    </Pressable>
  );
}

// ----------------------------------------------------------------- cómo se hace (foto + pasos) dentro de la sesión
// Memo con props primitivas: el reloj de la sesión y las series cargadas no la vuelven a dibujar.
const STEPS_PREVIEW = 4;
export const ExerciseHowTo = memo(function ExerciseHowTo({
  exerciseId, name, images, instructions, defaultOpen = true,
}: { exerciseId: string; name: string; images: string | null; instructions: string | null; defaultOpen?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const ripple = useRipple();
  const pics = useMemo(() => parseJson<string[]>(images, []), [images]);
  const steps = useMemo(() => parseJson<string[]>(instructions, []).filter((x) => typeof x === 'string' && x.trim()), [instructions]);
  const [open, setOpen] = useState(defaultOpen);
  const [allSteps, setAllSteps] = useState(false);
  if (!pics.length && !steps.length) return null;
  const openDetail = () => { haptic.tap(); router.push({ pathname: '/ejercicio/[id]', params: { id: exerciseId } }); };
  const shown = allSteps ? steps : steps.slice(0, STEPS_PREVIEW);

  return (
    <View style={styles.howto}>
      <View style={styles.howHead}>
        <Text variant="label" style={{ color: colors.text, flex: 1 }}>Cómo se hace</Text>
        <Pressable onPress={() => { haptic.select(); setOpen(!open); }} hitSlop={10}
          accessibilityRole="button" accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? 'Ocultar cómo se hace' : 'Ver cómo se hace'} style={{ marginLeft: space.md, flexShrink: 0 }}>
          <Text variant="label" style={{ color: colors.text }}>{open ? 'Ocultar' : 'Ver cómo se hace'}</Text>
        </Pressable>
      </View>
      {open ? (
        <>
          {pics.length ? (
            <Pressable onPress={openDetail} android_ripple={ripple} accessibilityRole="button"
              accessibilityLabel={`Foto de ${name}. Tocá para ver la ficha completa`}
              style={({ pressed }) => dimWhenPressed(pressed)}>
              <ExerciseImage images={pics} height={170} />
            </Pressable>
          ) : null}
          {shown.length ? (
            <View style={{ marginTop: space.md }}>
              {shown.map((t, i) => (
                <View key={i} style={styles.step}>
                  <Text variant="numberSm" tone="secondary" style={styles.stepN}>{i + 1}</Text>
                  <Text variant="small" style={{ flex: 1, color: colors.text }}>{t}</Text>
                </View>
              ))}
              {steps.length > STEPS_PREVIEW ? (
                <Pressable onPress={() => { haptic.select(); setAllSteps(!allSteps); }} hitSlop={8} accessibilityRole="button">
                  <Text variant="label" style={{ color: colors.text, marginTop: space.xs }}>
                    {allSteps ? 'Ver menos' : `Ver los ${steps.length} pasos`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <Pressable onPress={openDetail} hitSlop={8} accessibilityRole="button" style={{ marginTop: space.sm }}>
            <Text variant="label">Ver ficha completa →</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
});

// ----------------------------------------------------------------- resumen de técnica (cámara)
export function FormNote({ summary, style }: { summary: FormSummary; style?: object }) {
  const { colors } = useTheme();
  const good = summary.rated > 0 && summary.good === summary.rated;
  const tint = summary.rated === 0 ? colors.textDisabled : good ? CUE_OK : CUE_FIX;
  return (
    <View style={[{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }, style]} accessibilityLiveRegion="polite"
      accessibilityLabel={`Técnica: ${summary.text}. ${summary.line ?? ''}`}>
      <View style={{ width: 3, borderRadius: 2, backgroundColor: tint }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="small" style={{ color: colors.text, fontWeight: '600' }}>Técnica: {summary.text}</Text>
        {summary.line ? <Text variant="small">{summary.line}</Text> : null}
      </View>
    </View>
  );
}

// ----------------------------------------------------------------- barra de descanso
export function RestBar({
  endAt, total, onAdd, onSkip, inline,
}: { endAt: number | null; total: number; onAdd: (d: number) => void; onSkip: () => void; inline?: boolean }) {
  const { colors } = useTheme();
  const remaining = useCountdown(endAt);
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const ripple = useRipple();
  const pct = total > 0 ? Math.min(1, remaining / total) : 0;
  return (
    <View style={[styles.rest, inline && styles.restInline, { paddingBottom: insets.bottom + space.md }]}>
      <View style={[styles.restTrack]}>
        <View style={[styles.restFill, { width: `${pct * 100}%` }]} />
      </View>
      <View style={styles.restRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" numberOfLines={1}>Descanso</Text>
          <Text variant="number" style={{ fontSize: 40, lineHeight: 44 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{fmtClock(remaining)}</Text>
        </View>
        <Pressable android_ripple={ripple} onPress={() => { haptic.select(); onAdd(-15); }} style={({ pressed }) => [styles.restBtn, pressed && !IS_ANDROID && styles.restPressed]} hitSlop={6}
          accessibilityRole="button" accessibilityLabel="Restar 15 segundos">
          <Text variant="numberSm">−15</Text>
        </Pressable>
        <Pressable android_ripple={ripple} onPress={() => { haptic.select(); onAdd(15); }} style={({ pressed }) => [styles.restBtn, pressed && !IS_ANDROID && styles.restPressed]} hitSlop={6}
          accessibilityRole="button" accessibilityLabel="Sumar 15 segundos">
          <Text variant="numberSm">+15</Text>
        </Pressable>
        <Pressable android_ripple={ripple} onPress={() => { haptic.select(); onSkip(); }} style={({ pressed }) => [styles.restBtn, pressed && !IS_ANDROID && styles.restPressed]} hitSlop={6}
          accessibilityRole="button" accessibilityLabel="Saltar descanso">
          <Text variant="label" style={{ color: colors.text }}>Saltar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  howto: { marginBottom: space.lg },
  howHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm, minHeight: 24 },
  step: { flexDirection: 'row', gap: space.sm, paddingVertical: 3 },
  stepN: { minWidth: 22, fontSize: 13, lineHeight: 18 },
  entry: { paddingVertical: space.lg, borderTopWidth: line, borderTopColor: colors.line },
  entryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inputs: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  bigInput: {
    fontFamily: fonts.monoSemi, fontSize: 40, color: colors.text, paddingVertical: space.sm,
    borderBottomWidth: line, borderBottomColor: colors.line,
  },
  chips: { gap: space.sm, paddingVertical: space.lg },
  setLine: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: space.md,
    borderTopWidth: line, borderTopColor: colors.line,
  },
  rest: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface,
    borderTopWidth: line, borderTopColor: colors.line, paddingHorizontal: gutter,
  },
  restInline: { position: 'relative' },
  camRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  nudge: {
    height: 40, minWidth: 48, paddingHorizontal: space.sm, alignItems: 'center', justifyContent: 'center',
    borderWidth: line, borderColor: colors.line, borderRadius: radius.md,
  },
  restTrack: { height: 2, backgroundColor: colors.line, marginHorizontal: -gutter },
  restFill: { height: 2, backgroundColor: colors.text },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md },
  restPressed: { backgroundColor: colors.bg },
  restBtn: {
    height: 44, minWidth: 56, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: line, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden',
  },
}));
