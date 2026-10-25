import { usePowerSync, useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { searchFoods, type OffFood } from '@/lib/off';
import { MEALS, upsertOffFood, type FoodRow } from '@/nutrition/data';
import { space } from '@/theme';
import { Button, Field, Header, Row, Screen, Section, Text } from '@/ui';
import { friendlyError } from '@/ui/feedback';

export default function Agregar() {
  const { meal = 'snack', date } = useLocalSearchParams<{ meal?: string; date?: string }>();
  const db = usePowerSync();
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<OffFood[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failMsg, setFailMsg] = useState<string | null>(null);
  const like = `%${q.trim()}%`;

  // Local: favoritos, recientes y lo que ya está guardado (funciona sin señal)
  const { data: local } = useQuery<FoodRow>(
    `SELECT f.* FROM foods f
     LEFT JOIN (SELECT food_id, max(logged_at) AS last FROM food_logs WHERE deleted_at IS NULL GROUP BY food_id) r
       ON r.food_id = f.id
     WHERE f.deleted_at IS NULL AND (? = '' OR f.name LIKE ? OR f.brand LIKE ?)
     ORDER BY f.is_favorite DESC, r.last DESC NULLS LAST, f.name
     LIMIT 40`,
    [q.trim(), like, like],
  );

  const go = (foodId: string) => router.push({ pathname: '/comida/porcion', params: { foodId, meal, date: date ?? '' } });

  async function search() {
    setSearching(true); setFailMsg(null);
    try {
      const r = await searchFoods(q);
      if (r.kind === 'ok') return setRemote(r.foods);
      setRemote([]);
      setFailMsg(r.kind === 'offline'
        ? 'Sin señal. Usá lo guardado o cargalo a mano.'
        : r.status === 429
          ? 'Open Food Facts limita las búsquedas: esperá un minuto y probá de nuevo.'
          : `Open Food Facts no responde (${r.status || 'sin datos'}). Probá de nuevo en un rato.`);
    } finally {
      setSearching(false);
    }
  }

  async function pickRemote(f: OffFood) {
    try { go(await upsertOffFood(db, f)); }
    catch (e) { Alert.alert('No se pudo guardar', friendlyError(e)); }
  }

  const mealLabel = MEALS.find((m) => m.value === meal)?.label ?? 'Comida';

  return (
    <Screen>
      <Header label={mealLabel} title="Agregar" />
      <Field label="Buscar" value={q} onChangeText={(v) => { setQ(v); setRemote(null); }} placeholder="Yogur, pan lactal, milanesa…"
        returnKeyType="search" onSubmitEditing={search} autoCorrect={false} />

      <Button variant="primary" label="Escanear código" onPress={() => router.replace({ pathname: '/comida/escanear', params: { meal, date: date ?? '' } })} />

      <Section label={q.trim() ? 'Guardados' : 'Favoritos y recientes'}>
        {local.length ? local.map((f) => (
          <Row key={f.id} label={f.name}
            hint={[f.is_favorite ? 'Favorito' : null, f.brand, `${Math.round(f.kcal_100g)} kcal/100 g`].filter(Boolean).join(' · ')}
            onPress={() => go(f.id)} />
        )) : <Text variant="small" style={{ paddingVertical: space.lg }}>Nada guardado todavía.</Text>}
      </Section>

      {q.trim().length >= 3 ? (
        <Section label="Open Food Facts">
          {remote == null ? (
            <Button label={searching ? 'Buscando…' : `Buscar "${q.trim()}"`} onPress={search} loading={searching} style={{ marginTop: space.lg }} />
          ) : failMsg ? (
            <View style={{ paddingVertical: space.lg, gap: space.md }}>
              <Text variant="small">{failMsg}</Text>
              <Button label="Reintentar" onPress={search} loading={searching} />
            </View>
          ) : remote.length ? remote.map((f) => (
            <Row key={f.barcode} label={f.name} hint={[f.brand, `${Math.round(f.kcal_100g)} kcal/100 g`].filter(Boolean).join(' · ')}
              onPress={() => pickRemote(f)} />
          )) : <Text variant="small" style={{ paddingVertical: space.lg }}>Sin resultados.</Text>}
        </Section>
      ) : null}

      <Button variant="ghost" label="Crear alimento a mano" style={{ marginTop: space.xl }}
        onPress={() => router.push({ pathname: '/comida/nuevo', params: { meal, date: date ?? '', name: q.trim() } })} />
    </Screen>
  );
}
