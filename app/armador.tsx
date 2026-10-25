import { usePowerSync, useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import {
  MAIN_MUSCLES, MUSCLE_ES, buildRoutine, suggestDays,
  type BuilderInput, type BuiltRoutine, type EquipmentProfile, type Goal, type Joint, type Level,
} from '@/builder/build';
import { loadCatalog } from '@/builder/load';
import { saveBuiltRoutine } from '@/builder/save';
import { JOINT_ES } from '@/catalog/labels';
import { space } from '@/theme';
import { Button, ChipGroup, ExerciseThumb, Field, Header, Row, Screen, Section, Text, rangeError } from '@/ui';
import { needsFromIntensities, useMaxInputs } from '@/workout/maxes';
import { fmtKg, parseJson } from '@/workout/data';
import { friendlyError } from '@/ui/feedback';

const GOALS: { value: Goal; label: string }[] = [
  { value: 'perder_grasa', label: 'Perder grasa' }, { value: 'ganar_masa', label: 'Ganar masa' },
  { value: 'recomposicion', label: 'Recomposición' }, { value: 'fuerza', label: 'Fuerza' },
];
const LEVELS: { value: Level; label: string }[] = [
  { value: 'principiante', label: 'Menos de 1 año' }, { value: 'intermedio', label: '1 a 3 años' },
  { value: 'avanzado', label: 'Más de 3 años' },
];
const EQUIP: { value: EquipmentProfile; label: string }[] = [
  { value: 'gimnasio', label: 'Gimnasio completo' }, { value: 'mancuernas', label: 'Mancuernas en casa' },
  { value: 'casa', label: 'Solo peso corporal' },
];
const JOINTS = Object.keys(JOINT_ES) as Joint[];

type Settings = {
  goal: string | null; experience: string | null; days_available: number | null;
  minutes_per_session: number | null; equipment: string | null; injured_joints: string | null;
};

export default function Armador() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const db = usePowerSync();
  const { data: st } = useQuery<Settings>(
    'SELECT goal, experience, days_available, minutes_per_session, equipment, injured_joints FROM user_settings LIMIT 1',
  );

  const [inp, setInp] = useState<BuilderInput>({
    goal: 'ganar_masa', level: 'principiante', days: 3, minutes: 60, equipment: 'gimnasio', injuries: [],
  });
  const [result, setResult] = useState<BuiltRoutine | null>(null);
  const [busy, setBusy] = useState(false);

  // Precarga lo que ya respondió antes
  useEffect(() => {
    const s = st[0];
    if (!s) return;
    setInp((p) => ({
      goal: (s.goal as Goal) ?? p.goal,
      level: (s.experience as Level) ?? p.level,
      days: s.days_available ?? p.days,
      minutes: s.minutes_per_session ?? p.minutes,
      equipment: (parseJson<string[]>(s.equipment, [])[0] as EquipmentProfile) ?? p.equipment,
      injuries: parseJson<Joint[]>(s.injured_joints, p.injuries),
    }));
  }, [st.length]);

  const set = <K extends keyof BuilderInput>(k: K, v: BuilderInput[K]) => setInp((p) => ({ ...p, [k]: v }));
  const toggleJoint = (j: Joint) =>
    set('injuries', inp.injuries.includes(j) ? inp.injuries.filter((x) => x !== j) : [...inp.injuries, j]);

  async function build() {
    setBusy(true);
    try {
      const cat = await loadCatalog(db);
      const r = buildRoutine(cat, inp);
      if (!r) {
        const alt = suggestDays(cat, inp);
        if (alt == null) {
          Alert.alert('Sin método', 'No hay un método para esa combinación de nivel y equipo.');
        } else {
          Alert.alert('Sin método', `Con ${inp.days} días no hay un método para tu nivel y equipo. Con ${alt} días sí.`, [
            { text: 'Cancelar', style: 'cancel' },
            { text: `Armar con ${alt} días`, onPress: () => { const next = { ...inp, days: alt }; setInp(next); setResult(buildRoutine(cat, next)); } },
          ]);
        }
      }
      setResult(r);
    } catch (e) {
      Alert.alert('No se pudo armar', friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  // 5/3/1 y GVT: el 1RM se pide antes de guardar
  const needs = useMemo(() => needsFromIntensities(
    (result?.days ?? []).flatMap((d) => d.blocks.map((b) => ({ exerciseId: b.exercise_id, name: b.exercise.name_es, intensity: b.intensity }))),
  ), [result]);
  const maxInputs = useMaxInputs(needs);

  async function save() {
    if (!result) return;
    setBusy(true);
    try {
      const cat = await loadCatalog(db);
      const rule = cat.rules.get(inp.goal);
      if (!rule) throw new Error('Faltan las reglas del armador');
      await maxInputs.save(db);
      await saveBuiltRoutine(db, result, inp, rule);
      // desde la bienvenida vuelve a la lista de pasos; si no, a Entrenar
      if (from === 'bienvenida') router.back(); else router.replace('/');
    } catch (e) {
      Alert.alert('No se pudo guardar', friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  // ----------------------------------------------------------------- resultado
  if (result) {
    const r = result;
    const main = Object.entries(r.weeklySets).filter(([m]) => MAIN_MUSCLES.has(m));
    return (
      <Screen>
        <Header label="Tu rutina" title={r.method.name} />
        <Text variant="small" style={{ marginTop: -space.md }}>{r.reason}</Text>
        {r.keepsMethodRules ? (
          <Text variant="small" style={{ marginTop: space.sm }}>
            Este método tiene reglas propias: respeto sus series, reps e intensidad.
          </Text>
        ) : null}

        {r.days.map((d) => (
          <Section key={d.day_index} label={`${d.name} · ~${d.estMinutes} min`}>
            {d.blocks.map((b) => {
              const rir = b.intensity.type === 'rir' ? ` · RIR ${b.intensity.value}` : '';
              return (
                <Row key={`${d.day_index}-${b.position}`} label={b.exercise.name_es} hint={b.changed}
                  left={<ExerciseThumb images={b.exercise.images} name={b.exercise.name_es} size={48} />}
                  value={`${b.sets}×${b.reps_min === b.reps_max ? b.reps_min : `${b.reps_min}-${b.reps_max}`}${b.rep_unit === 'sec' ? 's' : ''}${rir}`} />
              );
            })}
          </Section>
        ))}

        {main.length ? (
          <Section label={r.targetWeekly ? `Series por semana · objetivo ${r.targetWeekly}` : 'Series por semana'}>
            {main.map(([m, v]) => (
              <Row key={m} label={MUSCLE_ES[m] ?? m} value={fmtKg(v)} />
            ))}
          </Section>
        ) : null}

        <Section label="Cardio">
          <Row label="Zona 2" value={`${r.cardio.z2MinWeek[0]}-${r.cardio.z2MinWeek[1]} min/sem`}
            hint="Caminata rápida, bici o elíptico a ritmo de charla" />
          {r.cardio.steps ? <Row label="Pasos por día" value={r.cardio.steps.toLocaleString('es-AR')} /> : null}
          {r.cardio.hiit ? <Row label="HIIT" value={`${r.cardio.hiit}/sem`} hint="Opcional" /> : null}
          {r.cardio.note ? <Row label={r.cardio.note} /> : null}
        </Section>

        {r.changes.length ? (
          <Section label="Ajustes">
            {r.changes.map((c, i) => <Row key={i} label={c} />)}
          </Section>
        ) : null}

        {r.alternatives.length ? (
          <Section label="También te sirve">
            {r.alternatives.map((a) => (
              <Row key={a.method.id} label={a.method.name} hint={a.reason} value="→"
                onPress={() => router.push({ pathname: '/metodo/[id]', params: { id: a.method.id } })} />
            ))}
          </Section>
        ) : null}

        {needs.length ? (
          <Section label={needs.some((n) => n.tm) ? 'Tus 1RM (el training max es el 90%)' : 'Tus 1RM'}>
            <View style={{ paddingTop: space.lg }}>
              {needs.map((n) => (
                <Field key={n.exerciseId} label={n.name} mono keyboardType="decimal-pad" placeholder="kg"
                  value={maxInputs.inputs[n.exerciseId] ?? ''} onChangeText={(v) => maxInputs.setInput(n.exerciseId, v)} maxLength={6}
                  error={rangeError(maxInputs.inputs[n.exerciseId], { min: 1, max: 500, label: '1RM', unit: 'kg' })} />
              ))}
            </View>
          </Section>
        ) : null}

        <Button variant="primary" label="Usar esta rutina" onPress={save} loading={busy} disabled={maxInputs.missing || needs.some((n) => !!rangeError(maxInputs.inputs[n.exerciseId], { min: 1, max: 500, label: '1RM', unit: 'kg' }))}
          style={{ marginTop: space.xxl }} />
        <Button variant="ghost" label="Cambiar respuestas" onPress={() => setResult(null)} style={{ marginTop: space.sm }} />
      </Screen>
    );
  }

  // ----------------------------------------------------------------- test
  return (
    <Screen>
      <Header label="Armador" title="Tu rutina en 6 preguntas" />
      <ChipGroup label="1 · Objetivo" value={inp.goal} onChange={(v) => set('goal', v)} options={GOALS} />
      <ChipGroup label="2 · Experiencia entrenando" value={inp.level} onChange={(v) => set('level', v)} options={LEVELS} />
      <ChipGroup label="3 · Días por semana" mono value={inp.days} onChange={(v) => set('days', v)}
        options={[2, 3, 4, 5, 6].map((d) => ({ value: d, label: String(d) }))} />
      <ChipGroup label="4 · Minutos por sesión" mono value={inp.minutes} onChange={(v) => set('minutes', v)}
        options={[30, 45, 60, 75, 90].map((d) => ({ value: d, label: String(d) }))} />
      <ChipGroup label="5 · Equipo" value={inp.equipment} onChange={(v) => set('equipment', v)} options={EQUIP} />
      <ChipGroup label="6 · Molestias o lesiones" value={inp.injuries} onChange={toggleJoint}
        options={JOINTS.map((j) => ({ value: j, label: JOINT_ES[j] ?? j }))} />
      <View style={{ height: space.md }} />
      <Button variant="primary" label="Armar rutina" onPress={build} loading={busy} />
    </Screen>
  );
}
