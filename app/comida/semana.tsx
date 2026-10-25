import { usePowerSync, useQuery } from '@powersync/react';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { applyCheckin, evaluateLastWeek, logWeight } from '@/nutrition/data';
import { recomputeStrength } from '@/progress/strength';
import { space } from '@/theme';
import { Button, EmptyState, Field, Header, Row, Screen, Section, Text, haptic, rangeError } from '@/ui';
import { fmtKg, parseNum } from '@/workout/data';
import { friendlyError } from '@/ui/feedback';

type Ev = NonNullable<Awaited<ReturnType<typeof evaluateLastWeek>>>;

export default function Semana() {
  const db = usePowerSync();
  const [ev, setEv] = useState<Ev | null>(null);
  const [kg, setKg] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: weights } = useQuery<{ measured_at: string; weight_kg: number }>(
    `SELECT measured_at, weight_kg FROM body_measurements WHERE weight_kg IS NOT NULL AND deleted_at IS NULL
     ORDER BY measured_at DESC LIMIT 14`,
  );

  const reload = useCallback(() => { evaluateLastWeek(db).then(setEv).catch(() => setEv(null)); }, [db]);
  useFocusEffect(reload);

  const kgErr = rangeError(kg, { min: 30, max: 300, label: 'Peso', unit: 'kg' });
  const kgOk = !!kg.trim() && !kgErr;
  async function addWeight() {
    const v = parseNum(kg);
    if (!kgOk || v == null) { haptic.warn(); return; }
    try { await logWeight(db, v); setKg(''); haptic.success(); reload(); recomputeStrength(db).catch(() => {}); }
    catch (e) { Alert.alert('No se guardó', friendlyError(e)); }
  }

  async function decide(apply: boolean) {
    if (!ev) return;
    setBusy(true);
    try {
      const out = await applyCheckin(db, ev, apply);
      if (out.note) Alert.alert(out.applied ? 'Ajuste aplicado' : 'Sin cambios', out.note);
      reload();
    }
    catch (e) { Alert.alert('No se guardó', friendlyError(e)); }
    finally { setBusy(false); }
  }

  const r = ev?.res;
  const pending = ev && !ev.existing && r && r.adjustmentKcal !== 0;

  return (
    <Screen>
      <Header label="Comida" title="Peso y semana" />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: space.md }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 160 }}>
          <Field label="Peso de hoy kg" mono keyboardType="decimal-pad" value={kg} onChangeText={setKg}
            placeholder="En ayunas, después del baño" onSubmitEditing={addWeight} error={kgErr} maxLength={6} />
        </View>
        <Button label="Registrar" onPress={addWeight} disabled={!kgOk} style={{ marginBottom: space.xl }} />
      </View>

      {ev && r ? (
        <Section label={`Semana del ${new Date(`${ev.weekStart}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`}>
          <Row label="Promedio" value={r.avgWeight != null ? `${fmtKg(r.avgWeight)} kg` : '—'} />
          <Row label="Semana anterior" value={r.prevAvgWeight != null ? `${fmtKg(r.prevAvgWeight)} kg` : '—'} />
          <Row label="Cambio" value={r.changeKg != null ? `${r.changeKg > 0 ? '+' : ''}${fmtKg(r.changeKg)} kg` : '—'} />
          <Row label="Buscado" value={`${ev.profile.rate_kg_week > 0 ? '+' : ''}${fmtKg(ev.profile.rate_kg_week)} kg`} />
          <Row label="Días registrados" value={`${ev.daysLogged}/7`} />
          <View style={{ paddingVertical: space.lg }}>
            <Text variant="label">Ajuste</Text>
            <Text variant="number">{r.adjustmentKcal > 0 ? '+' : ''}{r.adjustmentKcal} kcal</Text>
            <Text variant="small">{ev.existing ? (ev.existing.applied ? 'Ya aplicado.' : 'Ya revisado: se dejó igual.') : r.reason}</Text>
          </View>
          {pending ? (
            <>
              <Button variant="primary" label="Aplicar ajuste" onPress={() => decide(true)} loading={busy} />
              <Button variant="ghost" label="Dejar igual esta semana" onPress={() => decide(false)} style={{ marginTop: space.sm }} />
            </>
          ) : null}
          <Text variant="small" style={{ marginTop: space.lg }}>
            Se compara el promedio de cada semana, no un pesaje suelto: el agua y la sal mueven 1-2 kg de un día al otro.
            El ajuste mueve solo carbohidratos; proteína y grasa quedan fijas.
          </Text>
        </Section>
      ) : (
        <Text variant="small" style={{ marginTop: space.lg }}>Cargá tus datos en Comida para activar la revisión semanal.</Text>
      )}

      {weights.length ? (
        <Section label="Últimos pesajes">
          {weights.map((w, i) => (
            <Row key={i} label={new Date(w.measured_at).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
              value={`${fmtKg(w.weight_kg)} kg`} />
          ))}
        </Section>
      ) : (
        <EmptyState title="Sin pesajes todavía" text="Pesate a la mañana, en ayunas, y cargalo arriba. Con 4 o más pesajes por semana el ajuste es más preciso." />
      )}
    </Screen>
  );
}
