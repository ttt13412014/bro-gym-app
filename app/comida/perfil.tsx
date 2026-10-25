import { usePowerSync, useQuery } from '@powersync/react';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { ACTIVITY, RATES, ageFrom, computeTargets, parseYmd, type NGoal, type Sex } from '@/lib/nutrition';
import { accumulatedAdjustment, latestWeight, logWeight, saveProfileAndTarget, type Profile } from '@/nutrition/data';
import { space } from '@/theme';
import { Button, ChipGroup, Field, Header, Row, Screen, Section, Text, rangeError } from '@/ui';
import { fmtKg, parseNum } from '@/workout/data';
import { friendlyError } from '@/ui/feedback';

const GOALS: { value: NGoal; label: string }[] = [
  { value: 'perder_grasa', label: 'Perder grasa' }, { value: 'ganar_masa', label: 'Ganar masa' },
  { value: 'recomposicion', label: 'Recomposición' }, { value: 'fuerza', label: 'Fuerza' },
];

// DD/MM/AAAA -> YYYY-MM-DD, solo si la fecha existe (rechaza 31/02)
const toIso = (s: string) => {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  return parseYmd(iso) ? iso : null;
};
const fromIso = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

export default function Perfil() {
  const db = usePowerSync();
  const { data: profiles } = useQuery<Profile>('SELECT * FROM nutrition_profiles LIMIT 1');
  const { data: st } = useQuery<{ goal: string | null }>('SELECT goal FROM user_settings LIMIT 1');
  const prev = profiles[0];

  const [sex, setSex] = useState<Sex>('masculino');
  const [birth, setBirth] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [startWeight, setStartWeight] = useState<number | null>(null);
  const [activity, setActivity] = useState(1.55);
  const [goal, setGoal] = useState<NGoal>('ganar_masa');
  const [rate, setRate] = useState(RATES.ganar_masa[0]!.value);
  const [protein, setProtein] = useState(2);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [keepOffset, setKeepOffset] = useState(true);

  useEffect(() => {
    latestWeight(db).then((w) => { if (w) { setWeight(fmtKg(w)); setStartWeight(w); } });
    accumulatedAdjustment(db).then(setOffset);
  }, []);
  useEffect(() => {
    if (prev) {
      setSex(prev.sex); setBirth(fromIso(prev.birth_date)); setHeight(fmtKg(prev.height_cm));
      setActivity(prev.activity_factor); setGoal(prev.goal as NGoal); setRate(prev.rate_kg_week);
      setProtein(prev.protein_g_kg); setAuto(!!prev.auto_adjust);
    } else if (st[0]?.goal) {
      const g = st[0].goal as NGoal;
      setGoal(g); setRate(RATES[g]?.[0]?.value ?? 0);
    }
  }, [prev?.user_id, st.length]);

  const birthIso = toIso(birth);
  const h = parseNum(height);
  const w = parseNum(weight);
  const age = birthIso ? ageFrom(birthIso) : null;
  const valid = birthIso != null && age != null && age >= 14 && age <= 90 && h != null && h >= 120 && h <= 230
    && w != null && w >= 30 && w <= 300;

  const t = useMemo(() => (valid && age != null && h != null && w != null
    ? computeTargets({
      sex, weightKg: w, heightCm: h, age, activity, rateKgWeek: rate, proteinGKg: protein, fatPct: 0.25,
      adjustKcal: keepOffset ? offset : 0,
    })
    : null), [valid, sex, w, h, age, activity, rate, protein, keepOffset, offset]);

  // qué está mal, campo por campo (solo si ya se escribió algo)
  const birthErr = !birth.trim() ? null
    : !birthIso ? 'Fecha: escribila como DD/MM/AAAA (ej. 05/03/1995).'
    : age == null || age < 14 || age > 90 ? 'Fecha: la edad tiene que dar entre 14 y 90 años.' : null;
  const heightErr = rangeError(height, { min: 120, max: 230, label: 'Altura', unit: 'cm' });
  const weightErr = rangeError(weight, { min: 30, max: 300, label: 'Peso', unit: 'kg' });

  async function save() {
    if (!valid || !birthIso || h == null || w == null) return;
    setBusy(true);
    try {
      if (w !== startWeight) await logWeight(db, w);
      await saveProfileAndTarget(db, {
        sex, birth_date: birthIso, height_cm: h, activity_factor: activity, goal, rate_kg_week: rate,
        protein_g_kg: protein, fat_pct_kcal: 0.25, auto_adjust: auto ? 1 : 0,
      }, w, prev ? 'manual' : 'inicial', keepOffset ? offset : 0);
      router.back();
    } catch (e) {
      Alert.alert('No se guardó', friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header label="Comida" title="Tus datos" />
      <ChipGroup label="Sexo (lo pide la fórmula)" value={sex} onChange={setSex}
        options={[{ value: 'masculino', label: 'Hombre' }, { value: 'femenino', label: 'Mujer' }]} />
      <Field label="Fecha de nacimiento" mono placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation"
        value={birth} onChangeText={setBirth} maxLength={10} error={birthErr} />
      <Field label="Altura cm" mono keyboardType="decimal-pad" value={height} onChangeText={setHeight} maxLength={5} error={heightErr} />
      <Field label="Peso kg" mono keyboardType="decimal-pad" value={weight} onChangeText={setWeight} maxLength={6} error={weightErr} />

      <ChipGroup label="Actividad" value={activity} onChange={setActivity}
        options={ACTIVITY.map((a) => ({ value: a.value, label: a.label }))} />
      <Text variant="small" style={{ marginTop: -space.sm, marginBottom: space.lg }}>
        {ACTIVITY.find((a) => a.value === activity)?.hint}
      </Text>

      <ChipGroup label="Objetivo" value={goal} onChange={(g) => { setGoal(g); setRate(RATES[g][0]!.value); }} options={GOALS} />
      <ChipGroup label="Ritmo kg por semana" mono value={rate} onChange={setRate} options={RATES[goal]} />
      <ChipGroup label="Proteína g por kg" mono value={protein} onChange={setProtein}
        options={[1.6, 1.8, 2, 2.2].map((v) => ({ value: v, label: fmtKg(v) }))} />
      <ChipGroup label="Ajuste semanal" value={auto ? 'auto' : 'manual'} onChange={(v) => setAuto(v === 'auto')}
        options={[{ value: 'manual', label: 'Preguntarme' }, { value: 'auto', label: 'Aplicar solo' }]} />

      {offset !== 0 ? (
        <ChipGroup label={`Ajustes semanales acumulados: ${offset > 0 ? '+' : ''}${offset} kcal`}
          value={keepOffset ? 'keep' : 'reset'} onChange={(v) => setKeepOffset(v === 'keep')}
          options={[{ value: 'keep', label: 'Mantenerlos' }, { value: 'reset', label: 'Empezar de cero' }]} />
      ) : null}

      {t ? (
        <Section label="Tu objetivo">
          <Row label="Metabolismo basal" hint="Mifflin-St Jeor" value={`${t.bmr.toLocaleString('es-AR')} kcal`} />
          <Row label="Gasto diario" value={`${t.tdee.toLocaleString('es-AR')} kcal`} />
          <Row label="Objetivo" value={`${t.kcal.toLocaleString('es-AR')} kcal`} />
          <Row label="Proteína" value={`${t.protein_g} g`} />
          <Row label="Carbohidratos" value={`${t.carbs_g} g`} />
          <Row label="Grasas" value={`${t.fat_g} g`} />
          {t.notes.map((n, i) => <Text key={i} variant="small" style={{ marginTop: space.md }}>{n}</Text>)}
        </Section>
      ) : (
        <Text variant="small">Completá fecha, altura y peso para ver el cálculo.</Text>
      )}

      <Button variant="primary" label="Guardar" onPress={save} loading={busy} disabled={!valid} style={{ marginTop: space.xxl }} />
    </Screen>
  );
}
