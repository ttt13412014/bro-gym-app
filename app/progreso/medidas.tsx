import { usePowerSync, useQuery } from '@powersync/react';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { navyBodyFat } from '@/lib/body';
import { towardGoal } from '@/lib/goal';
import { setSettings } from '@/lib/settings';
import { recomputeStrength } from '@/progress/strength';
import { space } from '@/theme';
import { Button, ChipGroup, EmptyState, Field, Header, Row, Screen, Section, Text, confirmDestructive, haptic, rangeError, useTheme } from '@/ui';
import { LineChart } from '@/ui/charts';
import { currentUserId, fmtKg, nowIso, parseNum } from '@/workout/data';
import { friendlyError } from '@/ui/feedback';

type M = {
  id: string; measured_at: string; weight_kg: number | null; body_fat_pct: number | null; neck_cm: number | null;
  chest_cm: number | null; waist_cm: number | null; hip_cm: number | null; arm_cm: number | null;
  thigh_cm: number | null; calf_cm: number | null;
};

const FIELDS: { key: keyof M; label: string; unit: string }[] = [
  { key: 'weight_kg', label: 'Peso', unit: 'kg' },
  { key: 'waist_cm', label: 'Cintura', unit: 'cm' },
  { key: 'hip_cm', label: 'Cadera', unit: 'cm' },
  { key: 'chest_cm', label: 'Pecho', unit: 'cm' },
  { key: 'arm_cm', label: 'Brazo', unit: 'cm' },
  { key: 'thigh_cm', label: 'Muslo', unit: 'cm' },
  { key: 'calf_cm', label: 'Pantorrilla', unit: 'cm' },
  { key: 'neck_cm', label: 'Cuello', unit: 'cm' },
  { key: 'body_fat_pct', label: '% grasa', unit: '%' },
];
const RANGE: Partial<Record<keyof M, [number, number]>> = {
  weight_kg: [30, 300], body_fat_pct: [3, 60], neck_cm: [20, 70], chest_cm: [50, 200], waist_cm: [40, 200],
  hip_cm: [50, 200], arm_cm: [15, 70], thigh_cm: [30, 100], calf_cm: [20, 70],
};

export default function Medidas() {
  const db = usePowerSync();
  const { data: rows } = useQuery<M>(
    'SELECT * FROM body_measurements WHERE deleted_at IS NULL ORDER BY measured_at DESC LIMIT 200',
  );
  const { data: prof } = useQuery<{ sex: 'masculino' | 'femenino'; height_cm: number }>('SELECT sex, height_cm FROM nutrition_profiles LIMIT 1');
  const [vals, setVals] = useState<Partial<Record<keyof M, string>>>({});
  const [chart, setChart] = useState<keyof M>('weight_kg');
  const [busy, setBusy] = useState(false);
  const { colors } = useTheme();
  const { data: goalRows } = useQuery<{ goal_weight_kg: number | null }>('SELECT goal_weight_kg FROM user_settings LIMIT 1');
  const goal = goalRows[0]?.goal_weight_kg ?? null;
  const [goalText, setGoalText] = useState<string | null>(null); // null = no se está editando
  const goalErr = goalText != null ? rangeError(goalText, { min: 30, max: 300, label: 'Meta', unit: 'kg', required: true }) : null;

  async function saveGoal(v: number | null) {
    try {
      await setSettings(db, { goal_weight_kg: v });
      haptic.success();
      setGoalText(null);
    } catch (e) {
      Alert.alert('No se guardó la meta', friendlyError(e));
    }
  }
  function clearGoal() {
    confirmDestructive({
      title: 'Quitar meta', message: `Se quita la meta de ${fmtKg(goal)} kg. Tus pesajes no se tocan.`, confirmLabel: 'Quitar',
      onConfirm: () => saveGoal(null),
    });
  }
  const tone = (from: number, to: number) => {
    const t = towardGoal(from, to, goal);
    return t === 'good' ? colors.good : t === 'bad' ? colors.bad : null;
  };

  const num = (k: keyof M) => parseNum(vals[k] ?? '');
  const bad = FIELDS.filter((f) => {
    const v = num(f.key);
    const r = RANGE[f.key];
    return v != null && r && (v < r[0] || v > r[1]);
  });
  const filled = FIELDS.some((f) => num(f.key) != null);

  // Estimación Marina con lo cargado ahora o lo último registrado
  const lastOf = (k: keyof M) => num(k) ?? (rows.find((r) => r[k] != null)?.[k] as number | undefined) ?? null;
  const p = prof[0];
  const navy = p ? navyBodyFat({
    sex: p.sex, heightCm: p.height_cm, neckCm: lastOf('neck_cm'), waistCm: lastOf('waist_cm'), hipCm: lastOf('hip_cm'),
  }) : null;

  async function save() {
    if (!filled || bad.length) return;
    setBusy(true);
    try {
      const userId = await currentUserId(db);
      const ts = nowIso();
      const keys = FIELDS.map((f) => f.key).filter((k) => num(k) != null);
      await db.execute(
        `INSERT INTO body_measurements (id, user_id, measured_at, ${keys.join(', ')}, updated_at)
         VALUES (uuid(), ?, ?, ${keys.map(() => '?').join(', ')}, ?)`,
        [userId, ts, ...keys.map((k) => num(k)), ts],
      );
      setVals({});
      if (keys.includes('weight_kg')) recomputeStrength(db).catch(() => {});
    } catch (e) {
      Alert.alert('No se guardó', friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function remove(m: M) {
    const what = FIELDS.filter((f) => m[f.key] != null).map((f) => `${f.label} ${fmtKg(m[f.key] as number)} ${f.unit}`).join(', ');
    confirmDestructive({
      title: 'Borrar medición',
      message: `Se borra la medición del ${new Date(m.measured_at).toLocaleDateString('es-AR')}${what ? ` (${what})` : ''}.`,
      onConfirm: async () => {
        const ts = nowIso();
        await db.execute('UPDATE body_measurements SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, m.id]);
        if (m.weight_kg != null) recomputeStrength(db).catch(() => {});
      },
    });
  }

  const series = useMemo(
    () => rows.filter((r) => r[chart] != null).map((r) => ({ t: Date.parse(r.measured_at), v: r[chart] as number })).reverse(),
    [rows, chart],
  );
  const first = series[0]?.v, last = series.at(-1)?.v;
  const unit = FIELDS.find((f) => f.key === chart)?.unit ?? '';

  return (
    <Screen>
      <Header label="Progreso" title="Medidas" />
      <Text variant="small" style={{ marginTop: -space.md, marginBottom: space.lg }}>
        Cargá solo lo que midas hoy. Mismo horario y en ayunas para que se pueda comparar.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md }}>
        {FIELDS.map((f) => (
          <View key={f.key} style={{ width: '47%' }}>
            <Field label={`${f.label} ${f.unit}`} mono keyboardType="decimal-pad" value={vals[f.key] ?? ''}
              onChangeText={(v) => setVals({ ...vals, [f.key]: v })}
              placeholder={f.key === 'body_fat_pct' && navy ? fmtKg(navy) : '—'} />
          </View>
        ))}
      </View>
      {!navy && p && (num('waist_cm') != null || num('neck_cm') != null) ? (
        <Text variant="small" style={{ marginBottom: space.md }}>
          Para estimar el % de grasa necesito cuello y cintura{p.sex === 'femenino' ? ' y cadera' : ''}.
        </Text>
      ) : null}
      {navy ? (
        <Row label="% grasa estimado" hint="Fórmula de la Marina (cuello, cintura, cadera y altura) · ±3-4 puntos"
          value={`${fmtKg(navy)} %`} onPress={() => setVals({ ...vals, body_fat_pct: fmtKg(navy) })} />
      ) : null}
      {bad.length ? (
        <Text variant="small" style={{ marginVertical: space.md }}>
          Revisá: {bad.map((b) => `${b.label} (entre ${RANGE[b.key]![0]} y ${RANGE[b.key]![1]} ${b.unit})`).join(', ')}.
        </Text>
      ) : null}
      <Button variant="primary" label="Guardar medición" onPress={save} loading={busy} disabled={!filled || bad.length > 0}
        style={{ marginTop: space.lg }} />

      <Section label="Evolución">
        <View style={{ paddingTop: space.lg }}>
          <ChipGroup scroll value={chart} onChange={setChart} options={FIELDS.map((f) => ({ value: f.key, label: f.label }))} />
          <LineChart data={series} format={(v) => fmtKg(Math.round(v * 10) / 10)}
            goal={chart === 'weight_kg' ? goal : null} segmentColor={chart === 'weight_kg' && goal != null ? tone : undefined} />
          {chart === 'weight_kg' && goal != null && series.length > 1 ? (
            <Text variant="small" style={{ marginTop: space.sm }}>
              <Text variant="small" style={{ color: colors.good }}>Verde</Text>: te acercaste a la meta ·{' '}
              <Text variant="small" style={{ color: colors.bad }}>rojo</Text>: te alejaste
            </Text>
          ) : null}
          {first != null && last != null && series.length > 1 ? (
            <Row label="Cambio total" hint={`Desde ${new Date(series[0]!.t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`}
              value={`${last - first > 0 ? '+' : ''}${fmtKg(Math.round((last - first) * 10) / 10)} ${unit}`} />
          ) : null}
        </View>
      </Section>

      <Section label={goal != null ? `Meta de peso · ${fmtKg(goal)} kg` : 'Meta de peso'}>
        {goalText != null ? (
          <View style={{ paddingTop: space.md }}>
            <Field label="Meta kg" mono keyboardType="decimal-pad" value={goalText} onChangeText={setGoalText} autoFocus
              placeholder="ej. 80" error={goalText.trim() ? goalErr : null} />
            <Button variant="secondary" label="Guardar meta" disabled={!!goalErr}
              onPress={() => saveGoal(Math.round(parseNum(goalText)! * 10) / 10)} />
            <Button variant="ghost" label="Cancelar" onPress={() => setGoalText(null)} style={{ marginTop: space.xs }} />
          </View>
        ) : goal != null ? (
          <>
            {(() => {
              const lastW = rows.find((r) => r.weight_kg != null)?.weight_kg;
              if (lastW == null) return <Row label="Todavía no hay pesajes" hint="Cargá tu peso arriba" />;
              const diff = Math.round((goal - lastW) * 10) / 10;
              return (
                <Row label={Math.abs(diff) < 0.05 ? 'Llegaste a la meta' : diff < 0 ? `Te faltan bajar ${fmtKg(-diff)} kg` : `Te faltan subir ${fmtKg(diff)} kg`}
                  hint={`Último pesaje: ${fmtKg(lastW)} kg`} />
              );
            })()}
            <Row label="Cambiar meta" value="→" onPress={() => setGoalText(fmtKg(goal))} />
            <Row label="Quitar meta" onPress={clearGoal} />
          </>
        ) : (
          <Row label="Poné una meta de peso" hint="Se marca en el gráfico y cada cambio se pinta verde o rojo" value="→"
            onPress={() => setGoalText('')} />
        )}
      </Section>

      <Section label="Historial">
        {rows.slice(0, 30).map((m, idx) => {
          const prevW = m.weight_kg != null ? rows.slice(idx + 1).find((r) => r.weight_kg != null)?.weight_kg : undefined;
          const delta = m.weight_kg != null && prevW != null ? Math.round((m.weight_kg - prevW) * 10) / 10 : null;
          const c = delta != null && prevW != null ? tone(prevW, m.weight_kg!) : null;
          return (
          <Row key={m.id}
            label={new Date(m.measured_at).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
            hint={FIELDS.filter((f) => f.key !== 'weight_kg' && m[f.key] != null).map((f) => `${f.label} ${fmtKg(m[f.key] as number)}`).join(' · ') || undefined}
            value={m.weight_kg != null ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="numberSm">{fmtKg(m.weight_kg)} kg</Text>
                {delta != null && delta !== 0 ? (
                  <Text variant="small" style={c ? { color: c } : null}>{delta > 0 ? '+' : '−'}{fmtKg(Math.abs(delta))}</Text>
                ) : null}
              </View>
            ) : undefined}
            onPress={() => remove(m)} />
          );
        })}
        {rows.length ? <Text variant="small" style={{ marginTop: space.md }}>Tocá una medición para borrarla (te pregunta antes).</Text> : (
          <EmptyState title="Todavía no cargaste medidas" text="Completá arriba lo que midas hoy (aunque sea solo el peso) y tocá Guardar medición." />
        )}
      </Section>
    </Screen>
  );
}
