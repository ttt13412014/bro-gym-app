import { Pressable, StyleSheet, View } from 'react-native';
import { line, space } from '@/theme';
import { Text, haptic } from '@/ui';
import { fmtKg } from '@/workout/data';
import { dimWhenPressed, makeStyles, useRipple } from '@/ui';

// Macro: consumido / objetivo + línea de 2 px (texto claro, nunca acento)
export function MacroRow({ label, value, target, unit = 'g' }: { label: string; value: number; target: number | null; unit?: string }) {
  const styles = useStyles();
  const pct = target ? Math.min(1, value / target) : 0;
  const over = target != null && value > target * 1.05;
  return (
    <View style={styles.macro}>
      <View style={styles.macroHead}>
        <Text variant="body" style={{ flexShrink: 1 }}>{label}</Text>
        <Text variant="numberSm" style={{ flexShrink: 1, textAlign: 'right' }}>
          {fmtKg(Math.round(value))}
          <Text variant="numberSm" tone="secondary">{target != null ? ` / ${fmtKg(target)} ${unit}` : ` ${unit}`}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, opacity: over ? 0.5 : 1 }]} />
      </View>
    </View>
  );
}

// Fila de comida registrada: mantener apretado para borrar
export function LogRow({
  name, grams, kcal, onLongPress,
}: { name: string; grams: number; kcal: number; onLongPress: () => void }) {
  const styles = useStyles();
  const ripple = useRipple();
  return (
    <Pressable android_ripple={ripple} onLongPress={() => { haptic.tap(); onLongPress(); }} delayLongPress={450}
      accessibilityHint="Mantené apretado para borrar"
      style={({ pressed }) => [styles.log, dimWhenPressed(pressed)]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" numberOfLines={1}>{name}</Text>
        <Text variant="small">{fmtKg(grams)} g</Text>
      </View>
      <Text variant="numberSm" style={{ flexShrink: 0 }}>{Math.round(kcal)}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  macro: { paddingVertical: space.md, borderBottomWidth: line, borderBottomColor: colors.line },
  macroHead: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: space.md, marginBottom: space.sm },
  track: { height: 2, backgroundColor: colors.line },
  fill: { height: 2, backgroundColor: colors.text },
  log: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md,
    borderBottomWidth: line, borderBottomColor: colors.line,
  },
}));
