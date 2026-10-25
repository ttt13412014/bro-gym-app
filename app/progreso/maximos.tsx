import { usePowerSync, useQuery } from '@powersync/react';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { recomputeStrength } from '@/progress/strength';
import { E1RM_SQL, E1RM_WHERE } from '@/lib/e1rm';
import { space } from '@/theme';
import { Button, EmptyState, ExerciseThumb, Field, Header, Row, Screen, Section, Text, haptic, rangeError } from '@/ui';
import { currentUserId, fmtKg, nowIso, parseNum } from '@/workout/data';
import { friendlyError } from '@/ui/feedback';

type Mx = {
  exercise_id: string; name_es: string; images: string | null; one_rm_kg: number | null; training_max_kg: number | null;
  source: string | null; measured_at: string | null; est: number | null;
};

const SOURCE_ES: Record<string, string> = { test: 'probado', manual: 'cargado', estimado: 'estimado', ciclo_531: 'ciclo 5/3/1' };

export default function Maximos() {
  const db = usePowerSync();
  // Banca/sentadilla/peso muerto siempre (para cargar el primer 1RM) + ejercicios con 1RM cargado o con series: último máximo + mejor estimado de 6 meses
  const { data } = useQuery<Mx>(
    `WITH last AS (
       SELECT x.* FROM user_exercise_maxes x
       WHERE x.deleted_at IS NULL AND x.measured_at = (SELECT max(measured_at) FROM user_exercise_maxes y
                                                       WHERE y.exercise_id = x.exercise_id AND y.deleted_at IS NULL)),
     est AS (
       SELECT exercise_id, max(${E1RM_SQL()}) AS est
       FROM workout_sets WHERE ${E1RM_WHERE()}
         AND completed_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-180 days')
       GROUP BY exercise_id),
     ids AS (SELECT exercise_id FROM last UNION SELECT exercise_id FROM est
              UNION SELECT exercise_id FROM strength_standards)
     SELECT ids.exercise_id, e.name_es, e.images, last.one_rm_kg, last.training_max_kg, last.source, last.measured_at, est.est
     FROM ids JOIN exercises e ON e.id = ids.exercise_id
     LEFT JOIN last ON last.exercise_id = ids.exercise_id
     LEFT JOIN est ON est.exercise_id = ids.exercise_id
     ORDER BY coalesce(last.one_rm_kg, est.est, -1) DESC, e.name_es`,
  );
  const [edit, setEdit] = useState<string | null>(null);
  const [val, setVal] = useState('');

  const valErr = rangeError(val, { min: 1, max: 500, label: '1RM', unit: 'kg' });
  async function save(m: Mx) {
    const v = parseNum(val);
    if (valErr || !v) { haptic.warn(); return; }
    try {
      const userId = await currentUserId(db);
      const ts = nowIso();
      // si ya usa training max (5/3/1), se recalcula al 90%
      const tm = m.training_max_kg != null ? Math.round((v * 0.9) / 2.5) * 2.5 : null;
      await db.execute(
        `INSERT INTO user_exercise_maxes (id, user_id, exercise_id, one_rm_kg, training_max_kg, source, measured_at, updated_at)
         VALUES (uuid(), ?, ?, ?, ?, 'test', ?, ?)`,
        [userId, m.exercise_id, v, tm, ts, ts],
      );
      setEdit(null);
      haptic.success();
      recomputeStrength(db).catch(() => {});
    } catch (e) {
      Alert.alert('No se guardó', friendlyError(e));
    }
  }

  return (
    <Screen>
      <Header label="Progreso" title="1RM" />
      <Text variant="small" style={{ marginTop: -space.md, marginBottom: space.lg }}>
        El cargado es el que usan 5/3/1 y GVT. El estimado sale de tus series (Epley con RIR). Tocá uno para cargar un 1RM probado.
      </Text>
      <Section label={`${data.length} ejercicios`}>
        {data.map((m) => (
          <View key={m.exercise_id}>
            <Row
              label={m.name_es}
              left={<ExerciseThumb images={m.images} name={m.name_es} size={48} />}
              hint={[
                m.one_rm_kg != null ? `cargado ${fmtKg(m.one_rm_kg)} (${SOURCE_ES[m.source ?? ''] ?? m.source})` : null,
                m.training_max_kg != null ? `TM ${fmtKg(m.training_max_kg)}` : null,
                m.est != null ? `estimado ${fmtKg(Math.round(m.est * 2) / 2)}` : null,
              ].filter(Boolean).join(' · ')}
              value={fmtKg(m.one_rm_kg ?? (m.est != null ? Math.round(m.est * 2) / 2 : null))}
              onPress={() => { setEdit(m.exercise_id); setVal(m.one_rm_kg != null ? fmtKg(m.one_rm_kg) : ''); }}
            />
            {edit === m.exercise_id ? (
              <View style={{ paddingTop: space.lg }}>
                <Field label="1RM probado kg" mono keyboardType="decimal-pad" value={val} onChangeText={setVal} autoFocus maxLength={6} error={valErr} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  <Button variant="primary" label="Guardar" onPress={() => save(m)} disabled={!parseNum(val) || !!valErr} style={{ flexGrow: 1, flexBasis: 140 }} />
                  <Button variant="ghost" label="Cancelar" onPress={() => setEdit(null)} />
                </View>
              </View>
            ) : null}
          </View>
        ))}
        {!data.length ? <EmptyState title="Todavía no hay ejercicios" text="Hacé una sesión o esperá que termine de sincronizar: acá aparecen banca, sentadilla, peso muerto y lo que entrenes." /> : null}
      </Section>
    </Screen>
  );
}
