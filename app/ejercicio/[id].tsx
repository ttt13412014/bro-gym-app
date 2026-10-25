import { useQuery } from '@powersync/react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { EQUIPMENT_ES, JOINT_ES, MUSCLE_ES } from '@/catalog/labels';
import { E1RM_SQL, E1RM_WHERE } from '@/lib/e1rm';
import { space } from '@/theme';
import { ExerciseImage, Header, Row, Screen, Section, Text } from '@/ui';
import { LineChart } from '@/ui/charts';
import { fmtKg, parseJson } from '@/workout/data';

type E = {
  id: string; name: string; name_es: string; equipment: string | null; mechanic: string | null;
  primary_muscles: string; secondary_muscles: string; images: string; instructions: string; joints: string;
};
type S = { weight_kg: number | null; reps: number | null; rir: number | null; rpe: number | null; completed_at: string; rep_unit: string };

const muscles = (s: string) => parseJson<string[]>(s, []).map((m) => MUSCLE_ES[m] ?? m).join(', ');

export default function Ejercicio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useQuery<E>('SELECT * FROM exercises WHERE id = ?', [id]);
  // últimas series (solo para la lista "Tu historial")
  const { data: hist } = useQuery<S>(
    `SELECT weight_kg, reps, rir, rpe, completed_at, rep_unit
     FROM workout_sets WHERE exercise_id = ? AND deleted_at IS NULL AND set_type != 'warmup' AND parent_set_id IS NULL
     ORDER BY completed_at DESC LIMIT 5`,
    [id],
  );
  // mejor e1RM por día local, todo el historial (agregado en SQL)
  const { data: days } = useQuery<{ d: string; v: number }>(
    `SELECT date(completed_at, 'localtime') AS d, max(${E1RM_SQL()}) AS v
     FROM workout_sets WHERE exercise_id = ? AND ${E1RM_WHERE()}
     GROUP BY d ORDER BY d`,
    [id],
  );
  // mejor peso con al menos N reps (solo series en reps, con peso, principales), todo el historial
  const { data: repMaxes } = useQuery<{ k: number; weight_kg: number; reps: number; completed_at: string }>(
    `WITH n(k) AS (VALUES (1), (3), (5), (8), (10), (12)),
     s AS (SELECT weight_kg, reps, completed_at FROM workout_sets
           WHERE exercise_id = ? AND deleted_at IS NULL AND rep_unit = 'reps' AND weight_kg > 0 AND reps > 0
             AND set_type != 'warmup' AND parent_set_id IS NULL),
     j AS (SELECT n.k, s.*, row_number() OVER (PARTITION BY n.k ORDER BY s.weight_kg DESC, s.reps DESC, s.completed_at) AS rn
           FROM n JOIN s ON s.reps >= n.k)
     SELECT k, weight_kg, reps, completed_at FROM j WHERE rn = 1 ORDER BY k`,
    [id],
  );
  const e = data[0];
  if (!e) return <Screen><Header title="Cargando" /></Screen>;

  const byDay = days.map((r) => ({ t: new Date(`${r.d}T12:00:00`).getTime(), v: r.v }));
  const bestE1rm = days.length ? Math.max(...days.map((r) => r.v)) : null;
  const instructions = parseJson<string[]>(e.instructions, []);
  const joints = parseJson<string[]>(e.joints, []);

  return (
    <Screen>
      <Header label={e.mechanic === 'compound' ? 'Compuesto' : e.mechanic === 'isolation' ? 'Aislamiento' : 'Ejercicio'} title={e.name_es} />
      <ExerciseImage images={parseJson<string[]>(e.images, [])} />

      <Section label="Datos">
        <Row label="Principal" hint={muscles(e.primary_muscles) || '—'} />
        {parseJson<string[]>(e.secondary_muscles, []).length ? <Row label="Secundarios" hint={muscles(e.secondary_muscles)} /> : null}
        <Row label="Equipo" value={e.equipment ? EQUIPMENT_ES[e.equipment] ?? e.equipment : '—'} />
        {joints.length ? <Row label="Carga articulaciones" hint={joints.map((j) => JOINT_ES[j] ?? j).join(', ')} /> : null}
      </Section>

      {days.length ? (
        <Section label="1RM estimado por día">
          <View style={{ paddingTop: space.lg }}>
            <LineChart data={byDay} format={(v) => fmtKg(Math.round(v))} empty="Hace falta más de una sesión" />
          </View>
        </Section>
      ) : null}

      {repMaxes.length ? (
        <Section label="Mejor peso por repeticiones">
          {repMaxes.map((r) => (
            <Row key={r.k} label={`${r.k} ${r.k === 1 ? 'rep' : 'reps'} o más`}
              hint={`${fmtKg(r.weight_kg)} × ${r.reps} · ${new Date(r.completed_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`}
              value={`${fmtKg(r.weight_kg)} kg`} />
          ))}
        </Section>
      ) : null}

      {hist.length ? (
        <Section label="Tu historial">
          <View style={{ paddingVertical: space.lg }}>
            <Text variant="label">Mejor 1RM estimado</Text>
            <Text variant="number">{bestE1rm != null ? `${fmtKg(Math.round(bestE1rm * 2) / 2)} kg` : '—'}</Text>
          </View>
          {hist.map((s, i) => (
            <Row key={i}
              label={new Date(s.completed_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
              value={`${s.weight_kg ? `${fmtKg(s.weight_kg)} × ` : ''}${s.reps ?? '—'}${s.rep_unit === 'sec' ? ' s' : ''}${s.rir != null ? ` · RIR ${s.rir}` : s.rpe != null ? ` · RPE ${fmtKg(s.rpe)}` : ''}`} />
          ))}
        </Section>
      ) : null}

      {instructions.length ? (
        <Section label="Cómo se hace">
          {instructions.map((t, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.sm }}>
              <Text variant="numberSm" tone="disabled" style={{ minWidth: 20 }}>{i + 1}</Text>
              <Text variant="body" style={{ flex: 1, minWidth: 0 }}>{t}</Text>
            </View>
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}
