import { usePowerSync, useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { CATEGORY_ES, GOAL_ES, LEVEL_ES, daysLabel } from '@/catalog/labels';
import { E1RM_SQL, E1RM_WHERE } from '@/lib/e1rm';
import { space } from '@/theme';
import { Button, Divider, ExerciseThumb, Field, Header, Row, Screen, ScoreBar, Section, Text, rangeError } from '@/ui';
import { currentUserId, fmtKg, nowIso, parseJson, parseNum } from '@/workout/data';
import { cloneMethodLocal } from '@/workout/routines';
import { friendlyError } from '@/ui/feedback';

type Method = {
  id: string; name: string; creator: string | null; summary: string; target: string; category: string;
  goals: string; level: string; days_min: number; days_max: number; sets_reps_rest: string | null;
  intensity_summary: string | null; recovery_days_min: number; requires_one_rm: number;
  volume_score: number; intensity_score: number; frequency_score: number; rules: string;
};
type BlockLine = {
  template_id: string; day_index: number; day_name: string; position: number; exercise_id: string;
  exercise_name: string; images: string | null; sets: number; reps_min: number; reps_max: number; rep_unit: string;
  intensity: string; technique: string | null; group_key: string | null;
};
type Max = { exercise_id: string; one_rm_kg: number | null; training_max_kg: number | null };

export default function Metodo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = usePowerSync();
  const { data: ms } = useQuery<Method>('SELECT * FROM methods WHERE id = ?', [id]);
  const m = ms[0];
  const { data: lines } = useQuery<BlockLine>(
    `SELECT t.id AS template_id, t.day_index, t.name AS day_name, b.position, b.exercise_id,
            e.name_es AS exercise_name, e.images, b.sets, b.reps_min, b.reps_max, b.rep_unit, b.intensity,
            tq.name AS technique, b.group_key
     FROM method_templates t
     JOIN template_blocks b ON b.template_id = t.id
     JOIN exercises e ON e.id = b.exercise_id
     LEFT JOIN techniques tq ON tq.id = b.technique_id
     WHERE t.method_id = ? ORDER BY t.day_index, b.position`,
    [id],
  );

  // Ejercicios que necesitan 1RM / training max (bloques con % 1RM o % TM)
  const needs = useMemo(() => {
    const out = new Map<string, { name: string; tm: boolean }>();
    for (const l of lines) {
      const t = parseJson<{ type: string }>(l.intensity, { type: 'none' }).type;
      if (t === 'pct_1rm' || t === 'pct_tm') {
        const prev = out.get(l.exercise_id);
        out.set(l.exercise_id, { name: l.exercise_name, tm: (prev?.tm ?? false) || t === 'pct_tm' });
      }
    }
    return [...out.entries()];
  }, [lines]);

  const needIds = needs.map(([e]) => e);
  const { data: maxes } = useQuery<Max>(
    `SELECT exercise_id, one_rm_kg, training_max_kg FROM user_exercise_maxes x
     WHERE deleted_at IS NULL AND exercise_id IN (SELECT value FROM json_each(?))
       AND measured_at = (SELECT max(measured_at) FROM user_exercise_maxes y
                          WHERE y.exercise_id = x.exercise_id AND y.deleted_at IS NULL)`,
    [JSON.stringify(needIds)],
  );
  const { data: estimates } = useQuery<{ exercise_id: string; e1rm: number }>(
    `SELECT exercise_id, max(${E1RM_SQL()}) AS e1rm
     FROM workout_sets WHERE ${E1RM_WHERE()}
       AND exercise_id IN (SELECT value FROM json_each(?)) GROUP BY exercise_id`,
    [JSON.stringify(needIds)],
  );

  const [inputs, setInputs] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const [ex] of needs) {
      const mx = maxes.find((x) => x.exercise_id === ex)?.one_rm_kg;
      const est = estimates.find((x) => x.exercise_id === ex)?.e1rm;
      const v = mx ?? (est ? Math.round(est / 2.5) * 2.5 : null);
      if (v && !inputs[ex]) next[ex] = fmtKg(v);
    }
    if (Object.keys(next).length) setInputs((p) => ({ ...next, ...p }));
  }, [maxes.length, estimates.length, needs.length]);

  const [loading, setLoading] = useState(false);
  const missing = needs.some(([ex]) => !(parseNum(inputs[ex] ?? '') ?? 0));

  const days = useMemo(() => {
    const d = new Map<number, { name: string; lines: BlockLine[] }>();
    for (const l of lines) {
      const cur = d.get(l.day_index) ?? { name: l.day_name, lines: [] };
      cur.lines.push(l);
      d.set(l.day_index, cur);
    }
    return [...d.values()];
  }, [lines]);
  const techniques = [...new Set(lines.map((l) => l.technique).filter(Boolean))];

  async function load() {
    if (!m) return;
    setLoading(true);
    try {
      if (needs.length) {
        const userId = await currentUserId(db);
        const ts = nowIso();
        await db.writeTransaction(async (tx) => {
          for (const [ex, info] of needs) {
            const orm = parseNum(inputs[ex] ?? '');
            if (!orm) continue;
            const prev = maxes.find((x) => x.exercise_id === ex);
            if (prev?.one_rm_kg === orm) continue;
            const tm = info.tm ? Math.round((orm * 0.9) / 2.5) * 2.5 : null;
            await tx.execute(
              `INSERT INTO user_exercise_maxes (id, user_id, exercise_id, one_rm_kg, training_max_kg, source, measured_at, updated_at)
               VALUES (uuid(), ?, ?, ?, ?, 'manual', ?, ?)`,
              [userId, ex, orm, tm, ts, ts],
            );
          }
        });
      }
      await cloneMethodLocal(db, m.id);
      router.replace('/');
    } catch (e) {
      Alert.alert('No se pudo cargar', friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  if (!m) return <Screen><Header title="Cargando" /></Screen>;
  const goals = parseJson<string[]>(m.goals, []);

  return (
    <Screen>
      <Header label={CATEGORY_ES[m.category] ?? m.category} title={m.name} />
      {m.creator ? <Text variant="small" style={{ marginTop: -space.md, marginBottom: space.lg }}>{m.creator}</Text> : null}
      <Text variant="body">{m.summary}</Text>

      <Section label="Ficha">
        <Row label="Para quién" hint={m.target} />
        <Row label="Nivel" value={LEVEL_ES[m.level] ?? m.level} />
        <Row label="Objetivo" value={goals.map((g) => GOAL_ES[g] ?? g).join(', ')} />
        <Row label="Días por semana" value={daysLabel(m.days_min, m.days_max)} />
        {m.sets_reps_rest ? <Row label="Series · reps · descanso" hint={m.sets_reps_rest} /> : null}
        {m.intensity_summary ? <Row label="Intensidad" hint={m.intensity_summary} /> : null}
        {m.recovery_days_min > 0 ? <Row label="Descanso entre sesiones" value={`${m.recovery_days_min} d`} /> : null}
        {techniques.length ? <Row label="Técnicas" hint={techniques.join(', ')} /> : null}
      </Section>

      <Section label="Perfil">
        <ScoreBar label="Volumen" value={m.volume_score} />
        <ScoreBar label="Intensidad" value={m.intensity_score} />
        <ScoreBar label="Frecuencia" value={m.frequency_score} />
      </Section>

      {days.map((d) => (
        <Section key={d.name} label={d.name}>
          {d.lines.map((l) => (
            <Row
              key={`${l.template_id}-${l.position}`}
              label={`${l.group_key ? `${l.group_key} · ` : ''}${l.exercise_name}`}
              hint={l.technique ?? undefined}
              left={<ExerciseThumb images={l.images} name={l.exercise_name} size={48} />}
              onPress={() => router.push({ pathname: '/ejercicio/[id]', params: { id: l.exercise_id } })}
              value={`${l.sets}×${l.reps_min === l.reps_max ? l.reps_min : `${l.reps_min}-${l.reps_max}`}${l.rep_unit === 'sec' ? 's' : ''}`}
            />
          ))}
        </Section>
      ))}

      {needs.length ? (
        <Section label={needs.some(([, n]) => n.tm) ? 'Tus 1RM (el training max es el 90%)' : 'Tus 1RM'}>
          <View style={{ paddingTop: space.lg }}>
            {needs.map(([ex, n]) => (
              <Field key={ex} label={n.name} mono keyboardType="decimal-pad" placeholder="kg"
                value={inputs[ex] ?? ''} onChangeText={(v) => setInputs({ ...inputs, [ex]: v })} maxLength={6}
                error={rangeError(inputs[ex], { min: 1, max: 500, label: '1RM', unit: 'kg' })} />
            ))}
            <Text variant="small">Si no lo sabés, poné un peso que muevas 1 vez con buena técnica. Se ajusta solo con el uso.</Text>
          </View>
        </Section>
      ) : null}

      <Divider style={{ marginTop: space.xl }} />
      <Button variant="primary" label="Cargar rutina" onPress={load} loading={loading} disabled={missing || needs.some(([ex]) => !!rangeError(inputs[ex], { min: 1, max: 500, label: '1RM', unit: 'kg' }))}
        style={{ marginTop: space.xl }} />
    </Screen>
  );
}
