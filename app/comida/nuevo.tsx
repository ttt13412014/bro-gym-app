import { usePowerSync } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { createCustomFood } from '@/nutrition/data';
import { space } from '@/theme';
import { Button, Field, Header, Screen, Text, rangeError } from '@/ui';
import { parseNum } from '@/workout/data';
import { friendlyError } from '@/ui/feedback';

// Alimento propio: cuando Open Food Facts no lo tiene (pasa seguido con productos de acá) o sin señal
export default function Nuevo() {
  const prm = useLocalSearchParams<{
    barcode?: string; name?: string; brand?: string; kcal?: string; p?: string; c?: string; g?: string;
    serving?: string; missing?: string; meal?: string; date?: string;
  }>();
  const { barcode = '', meal = 'snack', date = '' } = prm;
  const db = usePowerSync();
  const fmt = (x?: string) => (x ? x.replace('.', ',') : '');
  const [v, setV] = useState({
    name: prm.name ?? '', brand: prm.brand ?? '', kcal: fmt(prm.kcal), p: fmt(prm.p), c: fmt(prm.c), g: fmt(prm.g),
    serving: fmt(prm.serving),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (t: string) => setV({ ...v, [k]: t });

  const kcal = parseNum(v.kcal);
  const pN = parseNum(v.p), cN = parseNum(v.c), gN = parseNum(v.g);
  const p = pN ?? 0, c = cN ?? 0, g = gN ?? 0;
  const fromMacros = Math.round(p * 4 + c * 4 + g * 9);
  // cada 100 g: ningún macro pasa de 100 y la suma tampoco (margen de 1 g por redondeo de etiqueta)
  const inRange = (x: number | null) => x == null || (x >= 0 && x <= 100);
  const macrosOk = inRange(pN) && inRange(cN) && inRange(gN) && p + c + g <= 101;
  const macrosFilled = pN != null && cN != null && gN != null;
  const kcalErr = rangeError(v.kcal, { min: 0, max: 900, label: 'Kcal', unit: 'cada 100 g' });
  const servingErr = rangeError(v.serving, { min: 1, max: 2000, label: 'Porción', unit: 'g' });
  const valid = v.name.trim().length > 1 && kcal != null && kcal >= 0 && kcal <= 900 && macrosOk && macrosFilled && !servingErr;
  const missing = [
    v.name.trim().length > 1 ? null : 'nombre',
    kcal == null ? 'kcal' : null,
    macrosFilled ? null : 'proteína, carbos y grasas',
  ].filter(Boolean);

  async function save() {
    if (!valid || kcal == null) return;
    setBusy(true);
    try {
      const id = await createCustomFood(db, {
        name: v.name.trim(), brand: v.brand.trim() || null, barcode: barcode || null,
        kcal_100g: kcal, protein_100g: p, carbs_100g: c, fat_100g: g,
        serving_g: parseNum(v.serving), serving_label: null,
      });
      router.replace({ pathname: '/comida/porcion', params: { foodId: id, meal, date } });
    } catch (e) {
      Alert.alert('No se guardó', friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header label={barcode ? `Código ${barcode}` : 'Alimento propio'} title="Cargar a mano" />
      {barcode ? (
        <Text variant="small" style={{ marginTop: -space.md, marginBottom: space.lg }}>
          {prm.missing
            ? `Está en Open Food Facts pero le faltan ${prm.missing}. Completalo con la tabla del envase.`
            : 'No está en Open Food Facts. Copiá la tabla nutricional del envase: queda guardado para la próxima vez que lo escanees.'}
        </Text>
      ) : null}
      <Field label="Nombre" value={v.name} onChangeText={set('name')} placeholder="Yogur bebible frutilla" />
      <Field label="Marca (opcional)" value={v.brand} onChangeText={set('brand')} />
      <Text variant="label" style={{ marginBottom: space.md }}>Cada 100 g</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 130, minWidth: 0 }}><Field label="Kcal" mono keyboardType="decimal-pad" value={v.kcal} onChangeText={set('kcal')} maxLength={6} error={kcalErr} /></View>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 130, minWidth: 0 }}><Field label="Proteína g" mono keyboardType="decimal-pad" value={v.p} onChangeText={set('p')} /></View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 130, minWidth: 0 }}><Field label="Carbos g" mono keyboardType="decimal-pad" value={v.c} onChangeText={set('c')} /></View>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 130, minWidth: 0 }}><Field label="Grasas g" mono keyboardType="decimal-pad" value={v.g} onChangeText={set('g')} /></View>
      </View>
      <Field label="Porción en g (opcional)" mono keyboardType="decimal-pad" value={v.serving} onChangeText={set('serving')} maxLength={6} error={servingErr} />
      {!macrosOk ? (
        <Text variant="small" style={{ marginBottom: space.lg }}>
          Cada macro va de 0 a 100 g y la suma no puede pasar 100 g (son valores cada 100 g).
        </Text>
      ) : null}
      {macrosOk && kcal != null && fromMacros > 0 && Math.abs(fromMacros - kcal) > Math.max(25, kcal * 0.15) ? (
        <Text variant="small" style={{ marginBottom: space.lg }}>
          Ojo: con esos macros dan {fromMacros} kcal. Revisá si copiaste la columna de 100 g.
        </Text>
      ) : null}
      {missing.length ? (
        <Text variant="small" style={{ marginBottom: space.lg }}>Para guardar falta: {missing.join(', ')}.</Text>
      ) : null}
      <Button variant="primary" label="Guardar" onPress={save} loading={busy} disabled={!valid} />
    </Screen>
  );
}
