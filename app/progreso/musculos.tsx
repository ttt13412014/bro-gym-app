import { useQuery } from '@powersync/react';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { MUSCLE_ES } from '@/catalog/labels';
import { mondayOf } from '@/lib/nutrition';
import { useToday } from '@/lib/useToday';
import { LEVEL_ALPHA, MUSCLE_SETS_SQL, MUSCLE_STEPS, addDays, muscleLevel, muscleSets } from '@/progress/stats';
import { line, radius, space } from '@/theme';
import { Button, EmptyState, FadeIn, Header, Row, Screen, Section, Segmented, Text, useTheme } from '@/ui';
import { BodyMap, MAP_MUSCLES } from '@/ui/BodyMap';
import { fmtKg } from '@/workout/data';

type Range = '7d' | 'semana';

export default function Musculos() {
  const { colors } = useTheme();
  const today = useToday();
  const [range, setRange] = useState<Range>('7d');
  const [selected, setSelected] = useState<string | null>(null);
  const from = range === '7d' ? addDays(today, -6) : mondayOf(new Date(`${today}T12:00:00`));

  const { data: rows, isLoading } = useQuery<{ pm: string | null; sm: string | null; n: number }>(MUSCLE_SETS_SQL, [from]);
  const sets = useMemo(() => muscleSets(rows), [rows]);
  const total = rows.reduce((a, r) => a + r.n, 0);

  const colorOf = (lvl: number) => (lvl === 0 ? colors.surface : `${colors.accent}${LEVEL_ALPHA[lvl]}`);
  const fill = (m: string) => {
    const lvl = muscleLevel(sets[m] ?? 0);
    return { color: colorOf(lvl), empty: lvl === 0 };
  };
  const list = MAP_MUSCLES.map((m) => ({ m, v: sets[m] ?? 0 })).sort((a, b) => b.v - a.v);
  const worked = list.filter((x) => x.v > 0);
  const zero = list.filter((x) => x.v === 0);
  const fmtSets = (v: number) => `${fmtKg(Math.round(v * 2) / 2)} ${v === 1 ? 'serie' : 'series'}`;

  return (
    <Screen>
      <Header label="Progreso" title="Mapa muscular" />
      <Segmented<Range> value={range} onChange={(v) => { setRange(v); setSelected(null); }}
        options={[{ value: '7d', label: 'Últimos 7 días' }, { value: 'semana', label: 'Esta semana' }]} />
      <Text variant="small" style={{ marginTop: -space.sm, marginBottom: space.md }}>
        Series efectivas desde el {new Date(`${from}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}.
        Directo cuenta 1, como músculo secundario cuenta media. Sin calentamiento.
      </Text>

      <FadeIn>
        <BodyMap fill={fill} selected={selected} onSelect={(m) => setSelected(selected === m ? null : m)} />
      </FadeIn>

      <View style={{ minHeight: 40, justifyContent: 'center', marginTop: space.sm }}>
        {selected ? (
          <Text variant="bodyStrong" style={{ textAlign: 'center' }}>
            {MUSCLE_ES[selected] ?? selected} · {(sets[selected] ?? 0) > 0 ? fmtSets(sets[selected]!) : 'sin series'}
          </Text>
        ) : (
          <Text variant="small" style={{ textAlign: 'center' }}>Tocá un músculo para ver cuántas series lleva.</Text>
        )}
      </View>

      {/* referencias */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md }}>
        <Legend color={colors.surface} border={colors.textDisabled} dashed label="0" />
        {MUSCLE_STEPS.map((s, i) => <Legend key={s.label} color={colorOf(i + 1)} border={colors.line} label={s.label} />)}
        <Text variant="small">series</Text>
      </View>

      {!isLoading && total === 0 ? (
        <EmptyState title="Sin series en este rango" text="Cuando cargues series en una sesión, se pinta cada músculo según cuánto lo trabajaste."
          action={<Button label="Ir a entrenar" onPress={() => router.replace('/')} />} />
      ) : (
        <>
          <Section label="Trabajados" count={worked.length}>
            {worked.map((x) => (
              <Row key={x.m} label={MUSCLE_ES[x.m] ?? x.m} value={fmtSets(x.v)} onPress={() => setSelected(x.m)} />
            ))}
            {/* una sola vez, no repetido en cada fila */}
            <Text variant="small" style={{ paddingTop: space.md }}>Referencia: para crecer se suele apuntar a 10-20 series por músculo por semana.</Text>
          </Section>
          <Section label="Sin series" count={zero.length}>
            {zero.length ? (
              <Text variant="body" style={{ paddingVertical: space.lg }}>{zero.map((x) => MUSCLE_ES[x.m] ?? x.m).join(' · ')}</Text>
            ) : (
              <Text variant="small" style={{ paddingVertical: space.lg }}>Trabajaste todos los grupos. Bien ahí.</Text>
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}

function Legend({ color, border, label, dashed }: { color: string; border: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      <View style={{ width: 14, height: 14, borderRadius: radius.sm, backgroundColor: color, borderWidth: line, borderColor: border, borderStyle: dashed ? 'dashed' : 'solid' }} />
      <Text variant="small">{label}</Text>
    </View>
  );
}

