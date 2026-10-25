import { usePowerSync } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { localIso, mondayOf } from '@/lib/nutrition';
import { WEEK_PRESET, createPlan, planWeeks, type PlanTemplate, type WeekKind } from '@/routine/edit';
import { space } from '@/theme';
import { Button, ChipGroup, Field, Header, HelpDot, Row, Screen, Section, Text } from '@/ui';
import { friendlyError } from '@/ui/feedback';

const TEMPLATES: { value: PlanTemplate; label: string; hint: string }[] = [
  { value: 'lineal', label: 'Lineal', hint: 'Acumulación, una de intensificación y descarga al final' },
  { value: 'ondulado', label: 'Ondulado', hint: 'Alterna acumulación e intensificación, descarga al final' },
  { value: 'sin_descarga', label: 'Sin descarga', hint: 'Todas iguales (para bloques cortos)' },
];
const KINDS = Object.keys(WEEK_PRESET) as WeekKind[];

export default function Plan() {
  const { routineId } = useLocalSearchParams<{ routineId: string }>();
  const db = usePowerSync();
  const thisMonday = mondayOf();
  const nextMonday = mondayOf(new Date(Date.now() + 7 * 86_400_000));
  const [name, setName] = useState('Mesociclo');
  const [weeks, setWeeks] = useState(5);
  const [template, setTemplate] = useState<PlanTemplate>('lineal');
  const [start, setStart] = useState(thisMonday);
  const [overrides, setOverrides] = useState<Record<number, WeekKind>>({});
  const [busy, setBusy] = useState(false);

  const kinds = useMemo(() => planWeeks(weeks, template).map((k, i) => overrides[i] ?? k), [weeks, template, overrides]);
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });

  async function save() {
    setBusy(true);
    try {
      await createPlan(db, { routineId, name, startDate: start, weeks: kinds });
      router.back();
    } catch (e) {
      Alert.alert('No se guardó', friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header label="Rutina" title="Mesociclo" right={<HelpDot term="mesociclo" />} />
      <Text variant="small" style={{ marginTop: -space.md, marginBottom: space.lg }}>
        Un bloque de semanas con descarga al final. El motor ajusta series, peso y RIR según la semana; tu progresión no se pierde.
      </Text>

      <Field label="Nombre" value={name} onChangeText={setName} maxLength={60} />
      <ChipGroup label="Empieza" value={start} onChange={setStart}
        options={[{ value: thisMonday, label: `Esta semana · ${fmt(thisMonday)}` }, { value: nextMonday, label: `La próxima · ${fmt(nextMonday)}` },
          { value: localIso(new Date()), label: 'Hoy' }].filter((o, i, a) => a.findIndex((x) => x.value === o.value) === i)} />
      <ChipGroup label="Semanas" mono value={weeks} onChange={(v) => { setWeeks(v); setOverrides({}); }}
        options={[3, 4, 5, 6, 8].map((w) => ({ value: w, label: String(w) }))} />
      <ChipGroup label="Esquema" value={template} onChange={(v) => { setTemplate(v); setOverrides({}); }}
        options={TEMPLATES.map((t) => ({ value: t.value, label: t.label }))} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: -space.sm }}>
        <Text variant="small" style={{ flex: 1 }}>{TEMPLATES.find((t) => t.value === template)?.hint}</Text>
        <HelpDot term="descarga" />
      </View>

      <Section label="Semanas · tocá para cambiar">
        {kinds.map((k, i) => (
          <Row key={i} label={`Semana ${i + 1}`} hint={WEEK_PRESET[k].hint} value={WEEK_PRESET[k].label}
            onPress={() => setOverrides({ ...overrides, [i]: KINDS[(KINDS.indexOf(k) + 1) % KINDS.length]! })} />
        ))}
      </Section>

      <View style={{ height: space.xl }} />
      <Button variant="primary" label="Crear mesociclo" onPress={save} loading={busy} disabled={!routineId} />
      <Text variant="small" style={{ marginTop: space.md }}>Si ya había un mesociclo activo en esta rutina, se da por terminado.</Text>
    </Screen>
  );
}
