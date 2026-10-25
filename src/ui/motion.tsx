// Animaciones: solo Animated con driver nativo (transform + opacity), cortas y con easing.
// Si el teléfono tiene "reducir movimiento", no se anima nada.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View, type PressableAndroidRippleConfig, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from './ThemeProvider';

export const IS_ANDROID = Platform.OS === 'android';
export const EASE_OUT = Easing.out(Easing.cubic);

// Preferencia del sistema, leída una vez al cargar y actualizada si cambia
let reduce = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduce = v; }).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { reduce = v; });
export const reduceMotion = () => reduce;

// Ripple de Android: gris translúcido del tema (sobre el acento, el color del texto del botón)
export function useRipple(onAccent = false): PressableAndroidRippleConfig | undefined {
  const { colors } = useTheme();
  return useMemo(
    () => (IS_ANDROID ? { color: onAccent ? `${colors.onAccent}29` : `${colors.textSecondary}38`, borderless: false } : undefined),
    [colors, onAccent],
  );
}

// En Android el ripple ya marca el toque: el atenuado queda solo para iOS (no se pisan)
export const dimWhenPressed = (pressed: boolean, opacity = 0.55): ViewStyle | null =>
  pressed && !IS_ANDROID ? { opacity } : null;

// Entrada: aparece y sube unos px. Solo al montar (los re-render y las consultas de PowerSync no la repiten).
const STAGGER_MAX = 8;
const STAGGER_MS = 35;
export function FadeIn({
  children, index = 0, animate = true, distance = 10, duration = 220, style,
}: {
  children: ReactNode; index?: number; animate?: boolean; distance?: number; duration?: number; style?: StyleProp<ViewStyle>;
}) {
  // se decide una sola vez: los ítems después del 8 (o fuera de la ventana de entrada) aparecen sin animar
  const on = useRef(animate && index < STAGGER_MAX && !reduceMotion()).current;
  const v = useRef(new Animated.Value(on ? 0 : 1)).current;
  useEffect(() => {
    if (!on) return;
    const a = Animated.timing(v, { toValue: 1, duration, delay: index * STAGGER_MS, easing: EASE_OUT, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, []);
  const enter = useRef(on ? { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] } : null).current;
  if (!enter) return <View style={style}>{children}</View>;
  return <Animated.View style={[style, enter]}>{children}</Animated.View>;
}

// Para listas: solo animan los ítems que montan en los primeros ms de la pantalla
// (al filtrar o al volver a scrollear arriba aparecen directo)
export function useEnterWindow(ms = 600) {
  const t0 = useRef(Date.now()).current;
  return () => Date.now() - t0 < ms;
}
