import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { line, radius, space } from '@/theme';
import { Text } from './Text';
import { haptic } from './feedback';
import { makeStyles, useTheme } from './ThemeProvider';
import { IS_ANDROID, useRipple } from './motion';

// Seleccionado = invertido (texto claro de fondo). Nunca acento.
export function Chip({
  label, selected, onPress, mono,
}: { label: string; selected: boolean; onPress: () => void; mono?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const ripple = useRipple();
  return (
    <Pressable
      android_ripple={selected ? undefined : ripple}
      onPress={() => { haptic.select(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [styles.chip, selected && styles.on, pressed && !selected && !IS_ANDROID && styles.pressed]}
    >
      <Text
        variant={mono ? 'numberSm' : 'label'}
        style={{ fontSize: mono ? 15 : 12, color: selected ? colors.bg : colors.textSecondary, flexShrink: 1, textAlign: 'center' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Fila de chips con etiqueta. single: elige uno; multi: varios.
export function ChipGroup<T extends string | number>({
  label, options, value, onChange, mono, scroll,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T | T[];
  onChange: (v: T) => void;
  mono?: boolean;
  scroll?: boolean;
}) {
  const styles = useStyles();
  const isOn = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  const chips = options.map((o) => (
    <Chip key={String(o.value)} label={o.label} mono={mono} selected={isOn(o.value)} onPress={() => onChange(o.value)} />
  ));
  return (
    <View style={{ marginBottom: space.lg }}>
      {label ? <Text variant="label" style={{ marginBottom: space.sm }}>{label}</Text> : null}
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{chips}</ScrollView>
      ) : (
        <View style={[styles.row, { flexWrap: 'wrap' }]}>{chips}</View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  chip: {
    minWidth: 44, minHeight: 40, maxWidth: '100%', paddingHorizontal: space.md, paddingVertical: 4, alignItems: 'center', justifyContent: 'center',
    borderWidth: line, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden',
  },
  pressed: { backgroundColor: colors.surface, opacity: 0.7 },
  on: { backgroundColor: colors.text, borderColor: colors.text },
  row: { flexDirection: 'row', gap: space.sm },
}));
