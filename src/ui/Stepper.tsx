import { Pressable, View } from 'react-native';
import { line, radius, space } from '@/theme';
import { haptic } from './feedback';
import { Text } from './Text';
import { makeStyles } from './ThemeProvider';
import { IS_ANDROID, useRipple } from './motion';

// − valor +  (números en mono; sin acento)
export function Stepper({
  label, value, onChange, min = 0, max = 999, step = 1, format = (v: number) => String(v),
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; format?: (v: number) => string;
}) {
  const styles = useStyles();
  const ripple = useRipple();
  // redondeo a 2 decimales: evita 2.7500000001 con pasos de 0,25
  const set = (v: number) => {
    const next = Math.min(max, Math.max(min, Math.round(Math.round(v / step) * step * 100) / 100));
    if (next === value) return;
    haptic.select();
    onChange(next);
  };
  const atMin = value <= min, atMax = value >= max;
  return (
    <View style={styles.wrap}>
      <Text variant="label" style={{ flex: 1, minWidth: 64 }}>{label}</Text>
      <Pressable onPress={() => set(value - step)} disabled={atMin} hitSlop={6} android_ripple={ripple}
        accessibilityRole="button" accessibilityLabel={`Bajar ${label}`} accessibilityState={{ disabled: atMin }}
        style={({ pressed }) => [styles.btn, atMin && styles.off, pressed && !IS_ANDROID && styles.pressed]}>
        <Text variant="numberSm">−</Text>
      </Pressable>
      <Text variant="numberSm" style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} accessibilityLiveRegion="polite">{format(value)}</Text>
      <Pressable onPress={() => set(value + step)} disabled={atMax} hitSlop={6} android_ripple={ripple}
        accessibilityRole="button" accessibilityLabel={`Subir ${label}`} accessibilityState={{ disabled: atMax }}
        style={({ pressed }) => [styles.btn, atMax && styles.off, pressed && !IS_ANDROID && styles.pressed]}>
        <Text variant="numberSm">+</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, borderBottomWidth: line, borderBottomColor: colors.line },
  btn: { width: 48, flexShrink: 0, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: line, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden' },
  off: { opacity: 0.35 },
  pressed: { backgroundColor: colors.surface, opacity: 0.7 },
  value: { minWidth: 64, maxWidth: 110, flexShrink: 1, textAlign: 'center' },
}));
