import { usePowerSync, useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { portion } from '@/lib/nutrition';
import { MEALS, logFood, toggleFavorite, today, type FoodRow, type Meal } from '@/nutrition/data';
import { space } from '@/theme';
import { Button, ChipGroup, Field, Header, Row, Screen, Section, Text, rangeError } from '@/ui';
import { fmtKg, parseNum } from '@/workout/data';
import { friendlyError } from '@/ui/feedback';

export default function Porcion() {
  const { foodId, meal: mealParam = 'snack', date } = useLocalSearchParams<{ foodId: string; meal?: string; date?: string }>();
  const db = usePowerSync();
  const { data } = useQuery<FoodRow>('SELECT * FROM foods WHERE id = ?', [foodId]);
  const f = data[0];
  const [grams, setGrams] = useState('');
  const [meal, setMeal] = useState<Meal>((mealParam as Meal) ?? 'snack');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (f && !grams) setGrams(fmtKg(f.serving_g ?? 100)); }, [f?.id]);

  if (!f) return <Screen><Header title="Cargando" /></Screen>;
  const g = parseNum(grams) ?? 0;
  const gramsErr = rangeError(grams, { min: 1, max: 3000, label: 'Gramos', unit: 'g', required: true });
  const m = portion(f, g);

  const presets = [
    ...(f.serving_g ? [{ value: f.serving_g, label: `1 porción · ${fmtKg(f.serving_g)} g` }, { value: f.serving_g * 2, label: '2 porciones' }] : []),
    ...[50, 100, 150, 200].map((v) => ({ value: v, label: `${v} g` })),
  ];

  async function add() {
    if (!f || g <= 0 || gramsErr) return;
    setBusy(true);
    try {
      await logFood(db, f, g, meal, date || today());
      router.dismissTo('/comida');
    } catch (e) {
      Alert.alert('No se guardó', friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header label={f.brand ?? (f.source === 'custom' ? 'Propio' : 'Alimento')} title={f.name} />

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.lg, marginBottom: space.lg }}>
        <View style={{ flex: 1, minWidth: 96 }}>
          <Field label="Gramos" mono keyboardType="decimal-pad" value={grams} onChangeText={setGrams} selectTextOnFocus
            maxLength={6} error={gramsErr} style={{ fontSize: 40 }} />
        </View>
        <View style={{ paddingBottom: space.xl, alignItems: 'flex-end', flexShrink: 1, maxWidth: '50%' }}>
          <Text variant="number" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{Math.round(m.kcal)}</Text>
          <Text variant="label">kcal</Text>
        </View>
      </View>

      <ChipGroup scroll value={g} onChange={(v) => setGrams(fmtKg(v))} options={presets} />

      <Section label="En esta porción">
        <Row label="Proteína" value={`${fmtKg(m.protein_g)} g`} />
        <Row label="Carbohidratos" value={`${fmtKg(m.carbs_g)} g`} />
        <Row label="Grasas" value={`${fmtKg(m.fat_g)} g`} />
      </Section>

      <View style={{ marginTop: space.xl }}>
        <ChipGroup label="Comida" value={meal} onChange={setMeal} options={MEALS} />
      </View>

      <Button variant="primary" label="Agregar" onPress={add} loading={busy} disabled={g <= 0 || !!gramsErr} />
      <Button variant="ghost" label={f.is_favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
        onPress={() => toggleFavorite(db, f.id, !f.is_favorite)} style={{ marginTop: space.sm }} />
      <Text variant="small" style={{ marginTop: space.lg }}>
        Cada 100 g: {Math.round(f.kcal_100g)} kcal · P {fmtKg(f.protein_100g)} · C {fmtKg(f.carbs_100g)} · G {fmtKg(f.fat_100g)}
        {f.source === 'off' ? ' · Open Food Facts' : ''}
      </Text>
    </Screen>
  );
}
