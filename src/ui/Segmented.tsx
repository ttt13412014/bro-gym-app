import { Pressable, StyleSheet, View } from 'react-native';
import { line, space } from '@/theme';
import { Text } from './Text';
import { haptic } from './feedback';
import { makeStyles, useTheme } from './ThemeProvider';
import { dimWhenPressed, useRipple } from './motion';

// Pestañas de texto con subrayado de 1 px (gris claro, no acento)
export function Segmented<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const ripple = useRipple();
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => { if (!on) { haptic.select(); onChange(o.value); } }}
            android_ripple={on ? undefined : ripple} accessibilityRole="tab" accessibilityState={{ selected: on }} hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
            style={({ pressed }) => [styles.tab, on && styles.on, dimWhenPressed(pressed, 0.6)]}>
            <Text variant="label" style={{ color: on ? colors.text : colors.textDisabled }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flexDirection: 'row', gap: space.xl, borderBottomWidth: line, borderBottomColor: colors.line, marginBottom: space.lg },
  tab: { flexShrink: 1, paddingVertical: space.md, overflow: 'hidden', marginBottom: -line, borderBottomWidth: line, borderBottomColor: 'transparent' },
  on: { borderBottomColor: colors.text },
}));
