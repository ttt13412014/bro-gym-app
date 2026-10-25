import { useQuery } from '@powersync/react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { GOAL_ES, LEVEL_ES, daysLabel } from '@/catalog/labels';
import { line, space } from '@/theme';
import { Header, Screen, Text } from '@/ui';
import { parseJson } from '@/workout/data';
import { makeStyles, useTheme } from '@/ui';

type M = {
  id: string; name: string; level: string; goals: string; days_min: number; days_max: number;
  volume_score: number; intensity_score: number; frequency_score: number;
  sets_reps_rest: string | null; intensity_summary: string | null; recovery_days_min: number;
};

export default function Comparar() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { a, b } = useLocalSearchParams<{ a: string; b: string }>();
  const { data } = useQuery<M>('SELECT * FROM methods WHERE id IN (?, ?)', [a, b]);
  const A = data.find((m) => m.id === a);
  const B = data.find((m) => m.id === b);
  if (!A || !B) return <Screen><Header title="Cargando" /></Screen>;

  const rows: { label: string; a: string; b: string; num?: boolean; diff?: number }[] = [
    { label: 'Volumen', a: String(A.volume_score), b: String(B.volume_score), num: true, diff: A.volume_score - B.volume_score },
    { label: 'Intensidad', a: String(A.intensity_score), b: String(B.intensity_score), num: true, diff: A.intensity_score - B.intensity_score },
    { label: 'Frecuencia', a: String(A.frequency_score), b: String(B.frequency_score), num: true, diff: A.frequency_score - B.frequency_score },
    { label: 'Días', a: daysLabel(A.days_min, A.days_max), b: daysLabel(B.days_min, B.days_max), num: true },
    { label: 'Descanso mín.', a: `${A.recovery_days_min} d`, b: `${B.recovery_days_min} d`, num: true },
    { label: 'Nivel', a: LEVEL_ES[A.level] ?? A.level, b: LEVEL_ES[B.level] ?? B.level },
    {
      label: 'Objetivo',
      a: parseJson<string[]>(A.goals, []).map((g) => GOAL_ES[g] ?? g).join(', '),
      b: parseJson<string[]>(B.goals, []).map((g) => GOAL_ES[g] ?? g).join(', '),
    },
    { label: 'Esquema', a: A.sets_reps_rest ?? '—', b: B.sets_reps_rest ?? '—' },
    { label: 'Intensidad', a: A.intensity_summary ?? '—', b: B.intensity_summary ?? '—' },
  ];

  return (
    <Screen>
      <Header label="Comparar" title={`${A.name} vs ${B.name}`} />
      <View style={styles.head}>
        <View style={styles.labelCol} />
        <Text variant="label" style={styles.col}>{A.name}</Text>
        <Text variant="label" style={styles.col}>{B.name}</Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={styles.row}>
          <Text variant="small" style={[styles.labelCol, { color: colors.text }]}>{r.label}</Text>
          {/* el valor más alto queda en blanco, el otro en gris */}
          <Text variant={r.num ? 'numberSm' : 'small'} tone={r.diff != null && r.diff < 0 ? 'secondary' : 'default'} style={styles.col}>{r.a}</Text>
          <Text variant={r.num ? 'numberSm' : 'small'} tone={r.diff != null && r.diff > 0 ? 'secondary' : 'default'} style={styles.col}>{r.b}</Text>
        </View>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  head: { flexDirection: 'row', paddingBottom: space.sm, borderBottomWidth: line, borderBottomColor: colors.line },
  row: { flexDirection: 'row', paddingVertical: space.md, borderBottomWidth: line, borderBottomColor: colors.line, gap: space.sm },
  labelCol: { width: 104, flexShrink: 0 },
  col: { flex: 1, minWidth: 0 },
}));
