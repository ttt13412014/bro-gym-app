// Ayudas cortas: "?" al lado de un término y avisos que salen una sola vez.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { line, radius, space } from '@/theme';
import { haptic } from './feedback';
import { FadeIn } from './motion';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

// ----------------------------------------------------------------- glosario (una línea cada uno)
export const HELP = {
  rir: { title: 'RIR', text: 'Repeticiones en reserva: cuántas más podías hacer al terminar la serie. RIR 2 = te quedaban 2.' },
  rpe: { title: 'RPE', text: 'Esfuerzo del 1 al 10: 10 es al fallo y 8 es que te quedaban 2 reps (RPE = 10 − RIR).' },
  mesociclo: { title: 'Mesociclo', text: 'Bloque de 3 a 8 semanas que sube la exigencia de a poco y cierra con una semana liviana.' },
  descarga: { title: 'Descarga', text: 'Semana liviana (mitad de series y 10% menos de peso) para recuperarte y volver más fuerte.' },
} as const;
export type HelpTerm = keyof typeof HELP;

// "?" chico: un toque muestra la explicación
export function HelpDot({ term, style }: { term: HelpTerm; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const h = HELP[term];
  return (
    <Pressable
      onPress={() => { haptic.tap(); Alert.alert(h.title, h.text); }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`Qué es ${h.title}`}
      style={({ pressed }) => [{
        minWidth: 20, minHeight: 20, flexShrink: 0, borderRadius: radius.sm, borderWidth: line, borderColor: colors.line,
        alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1,
      }, style]}
    >
      <Text variant="label" maxFontSizeMultiplier={1.4} style={{ fontSize: 11, lineHeight: 13, color: colors.textSecondary }}>?</Text>
    </Pressable>
  );
}

// ----------------------------------------------------------------- avisos de una sola vez (guardados en el teléfono)
const seenCache = new Map<string, boolean>();

export function useSeenOnce(key: string) {
  const k = `bro.tip.${key}`;
  // hasta leer el teléfono no se muestra nada (sin parpadeo)
  const [show, setShow] = useState(seenCache.has(k) ? !seenCache.get(k) : false);
  useEffect(() => {
    if (seenCache.has(k)) return;
    let alive = true;
    AsyncStorage.getItem(k)
      .then((v) => { seenCache.set(k, v === '1'); if (alive) setShow(v !== '1'); })
      .catch(() => { seenCache.set(k, true); });
    return () => { alive = false; };
  }, [k]);
  const dismiss = useCallback(() => {
    seenCache.set(k, true);
    setShow(false);
    AsyncStorage.setItem(k, '1').catch(() => {});
  }, [k]);
  // lo da por visto sin esconderlo (para avisos que salen una sola vez aunque no toques "Entendido")
  const markSeen = useCallback(() => {
    seenCache.set(k, true);
    AsyncStorage.setItem(k, '1').catch(() => {});
  }, [k]);
  return { show, dismiss, markSeen };
}

// Aviso chico con "Entendido" (aparece con un fundido corto)
export function Tip({ text, onClose, style }: { text: string; onClose: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <FadeIn style={style}>
      <View
        accessibilityRole="alert"
        style={{
          flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md,
          borderWidth: line, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface,
        }}
      >
        <Text variant="small" style={{ flex: 1, minWidth: 0, color: colors.text }}>{text}</Text>
        <Pressable onPress={() => { haptic.tap(); onClose(); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Entendido">
          {({ pressed }) => <Text variant="label" style={{ color: colors.text, opacity: pressed ? 0.6 : 1 }}>Entendido</Text>}
        </Pressable>
      </View>
    </FadeIn>
  );
}
