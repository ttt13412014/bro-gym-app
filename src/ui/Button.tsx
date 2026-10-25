import { useRef } from 'react';
import {
  ActivityIndicator, Animated, Pressable, StyleSheet, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle,
} from 'react-native';
import { line, radius, space } from '@/theme';
import { haptic } from './feedback';
import { Text } from './Text';
import { makeStyles, useTheme } from './ThemeProvider';
import { useTapGuard } from './useTapGuard';
import { IS_ANDROID, useRipple } from './motion';

type Props = Omit<PressableProps, 'children' | 'onPress' | 'style'> & {
  label: string;
  // `primary` lleva el acento: usar uno solo por pantalla
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  // si devuelve una promesa, el botón queda deshabilitado con spinner hasta que termine (no hay doble toque)
  onPress?: (e: GestureResponderEvent) => unknown;
  // vibración corta al tocar (por defecto solo en `primary`)
  haptics?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label, variant = 'secondary', loading, disabled, style, onPress, haptics, onPressIn, onPressOut, ...rest
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const isPrimary = variant === 'primary';
  const { run, busy } = useTapGuard(onPress);
  const spinning = loading || busy;
  const off = disabled || spinning;
  const scale = useRef(new Animated.Value(1)).current;
  const { outer, inner } = splitStyle(style);
  const ripple = useRipple(isPrimary);
  // Android: ripple + escala muy leve; iOS: escala + atenuado
  const down = IS_ANDROID ? 0.985 : 0.97;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <Animated.View style={[outer, styles.clip, inner.borderRadius != null && { borderRadius: inner.borderRadius }, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!off, busy: !!spinning }}
        disabled={off}
        hitSlop={4}
        android_ripple={ripple}
        onPressIn={(e) => { to(down); onPressIn?.(e); }}
        onPressOut={(e) => { to(1); onPressOut?.(e); }}
        onPress={(e) => {
          if (haptics ?? isPrimary) haptic.tap();
          run(e);
        }}
        style={(state) => [
          styles.base,
          isPrimary && styles.primary,
          variant === 'secondary' && styles.secondary,
          (disabled && !spinning) && styles.off,
          inner,
          state.pressed && !IS_ANDROID && styles.pressed,
        ]}
        {...rest}
      >
        {spinning ? (
          <ActivityIndicator color={isPrimary ? colors.onAccent : colors.text} />
        ) : (
          <Text variant="button" numberOfLines={1} style={isPrimary ? { color: colors.onAccent } : null}>
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

// margen, flex y posición van al contenedor animado; alto, padding y colores al botón
const OUTER = new Set([
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'minWidth', 'maxWidth',
  'position', 'top', 'bottom', 'left', 'right', 'zIndex',
]);
function splitStyle(style: StyleProp<ViewStyle>) {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const k of Object.keys(flat)) (OUTER.has(k) ? outer : inner)[k] = flat[k];
  if (outer.width != null || outer.flex != null) inner.alignSelf = 'stretch';
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

const useStyles = makeStyles((colors) => ({
  base: {
    height: 52,
    minWidth: 48,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  secondary: { borderWidth: line, borderColor: colors.line },
  off: { opacity: 0.4 },
  // recorta el ripple a las esquinas del botón
  clip: { overflow: 'hidden', borderRadius: radius.md },
  pressed: { opacity: 0.7 },
}));
