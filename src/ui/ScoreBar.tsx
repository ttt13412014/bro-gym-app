import { StyleSheet, View } from 'react-native';
import { space } from '@/theme';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

// 10 segmentos finos; el número al lado manda
export function ScoreBar({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text variant="small" style={{ width: 96, flexShrink: 0, color: colors.text }}>{label}</Text>
      <View style={styles.track}>
        {Array.from({ length: 10 }, (_, i) => (
          <View key={i} style={[styles.seg, { backgroundColor: i < value ? colors.text : colors.line }]} />
        ))}
      </View>
      <Text variant="numberSm" numberOfLines={1} style={{ minWidth: 28, flexShrink: 0, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  track: { flex: 1, minWidth: 40, flexDirection: 'row', gap: 2 },
  seg: { flex: 1, height: 4 },
});
