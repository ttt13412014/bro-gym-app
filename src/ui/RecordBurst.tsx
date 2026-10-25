// Festejo de récord: burbujas que salen del centro y se apagan + "¡Récord!" con un pop. ~1 s.
// Nunca bloquea toques (pointerEvents none) y queda montado vacío: tocar play no crea vistas.
import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { fonts, line, radius, space } from '@/theme';
import { EASE_OUT, reduceMotion } from './motion';
import { useTheme } from './ThemeProvider';

export type RecordBurstHandle = { play: () => void };

const N = 18;
const DURATION = 950;

export const RecordBurst = memo(forwardRef<RecordBurstHandle>(function RecordBurst(_, ref) {
  const { colors } = useTheme();
  const t = useRef(new Animated.Value(0)).current;      // 0 → 1: vuelo y fundido
  const pop = useRef(new Animated.Value(0)).current;    // escala del texto (spring)
  const dots = useRef(new Animated.Value(1)).current;   // 0 con "reducir movimiento": solo el cartel
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // trayectorias fijas: ángulos repartidos con algo de variación, distancias y tamaños distintos
  const parts = useMemo(() => Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2 + (((i * 37) % 10) / 10 - 0.5) * 0.5;
    const d = 70 + ((i * 53) % 60);
    const size = 6 + ((i * 29) % 7);
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 10, size, tone: i % 3 };
  }), []);

  useImperativeHandle(ref, () => ({
    play() {
      AccessibilityInfo.announceForAccessibility('¡Récord!');
      running.current?.stop();
      if (timer.current) clearTimeout(timer.current);
      if (reduceMotion()) {
        // sin movimiento: el cartel aparece quieto y se va
        dots.setValue(0);
        pop.setValue(1);
        t.setValue(0.5);
        timer.current = setTimeout(() => t.setValue(0), DURATION);
        return;
      }
      dots.setValue(1);
      t.setValue(0);
      pop.setValue(0.6);
      running.current = Animated.parallel([
        Animated.timing(t, { toValue: 1, duration: DURATION, easing: EASE_OUT, useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, damping: 9, stiffness: 260, mass: 0.6, useNativeDriver: true }),
      ]);
      running.current.start(() => { t.setValue(0); });
    },
  }), []);

  // nodos animados armados una vez (no se rearman en cada render de la sesión)
  const anim = useMemo(() => ({
    fade: Animated.multiply(t.interpolate({ inputRange: [0, 0.06, 0.7, 1], outputRange: [0, 1, 1, 0] }), dots),
    labelFade: t.interpolate({ inputRange: [0, 0.05, 0.8, 1], outputRange: [0, 1, 1, 0] }),
    scale: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.3, 1, 0.5] }),
    moves: parts.map((p) => ({
      x: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }),
      y: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }),
    })),
  }), [parts]);
  const { fade, labelFade } = anim;
  const tone = [colors.accent, colors.textSecondary, colors.text];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={styles.center}>
        {parts.map((p, i) => (
          <Animated.View
            key={i}
            style={[styles.dot, {
              width: p.size, height: p.size, borderRadius: p.size / 2, backgroundColor: tone[p.tone],
              opacity: fade,
              transform: [
                { translateX: anim.moves[i]!.x },
                { translateY: anim.moves[i]!.y },
                { scale: anim.scale },
              ],
            }]}
          />
        ))}
        <Animated.View style={[styles.tag, { backgroundColor: colors.bg, borderColor: colors.line, opacity: labelFade, transform: [{ scale: pop }] }]}>
          <Text style={[styles.label, { color: colors.text }]}>¡Récord!</Text>
        </Animated.View>
      </View>
    </View>
  );
}));

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute' },
  tag: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: line },
  label: { fontFamily: fonts.display, fontSize: 34, letterSpacing: -0.5 },
});
