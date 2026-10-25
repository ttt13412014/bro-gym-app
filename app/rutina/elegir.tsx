import { usePowerSync, useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { EQUIPMENT_ES, MUSCLE_ES } from '@/catalog/labels';
import { addBlock, replaceExercise } from '@/routine/edit';
import { gutter, space } from '@/theme';
import { ChipGroup, EXERCISE_ROW_H, EmptyState, ExerciseRow, FadeIn, Field, Header, Screen, Text, haptic, useEnterWindow } from '@/ui';
import { parseJson } from '@/workout/data';
import { useTheme } from '@/ui';
import { friendlyError } from '@/ui/feedback';

type E = { id: string; name_es: string; equipment: string | null; primary_muscles: string; mechanic: string | null; images: string | null };
const MUSCLES = ['chest', 'lats', 'middle back', 'shoulders', 'biceps', 'triceps', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'abdominals'];

// Elegir ejercicio: con dayId agrega un bloque; con blockId reemplaza el ejercicio del bloque
export default function Elegir() {
  const { colors } = useTheme();
  const { dayId, blockId } = useLocalSearchParams<{ dayId?: string; blockId?: string }>();
  const db = usePowerSync();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');

  // al reemplazar, primero los del mismo músculo y patrón
  const { data: current } = useQuery<{ primary_muscles: string; movement_pattern: string | null; name_es: string }>(
    `SELECT e.primary_muscles, e.movement_pattern, e.name_es FROM user_routine_blocks b JOIN exercises e ON e.id = b.exercise_id WHERE b.id = ?`,
    [blockId ?? ''],
  );
  const cur = current[0];
  const curMuscle = cur ? parseJson<string[]>(cur.primary_muscles, [])[0] ?? '' : '';
  const m = muscle || (q.trim() ? '' : curMuscle);
  const like = `%${q.trim()}%`;
  const { data, isLoading } = useQuery<E>(
    `SELECT id, name_es, equipment, primary_muscles, mechanic, images FROM exercises
     WHERE deleted_at IS NULL AND (name_es LIKE ? OR name LIKE ?) AND (? = '' OR primary_muscles LIKE ?)
     ORDER BY (movement_pattern IS NOT NULL AND movement_pattern = ?) DESC, (movement_pattern IS NULL), name_es LIMIT 2000`,
    [like, like, m, `%"${m}"%`, cur?.movement_pattern ?? ''],
  );

  async function pick(e: E) {
    try {
      if (blockId) {
        await replaceExercise(db, blockId, e.id);
        router.back();
      } else if (dayId) {
        const id = await addBlock(db, dayId, e.id, { compound: e.mechanic === 'compound' });
        router.replace({ pathname: '/rutina/bloque/[id]', params: { id } });
      }
    } catch (x) {
      Alert.alert('No se guardó', friendlyError(x));
    }
  }

  const header = (
    <View>
      <Header label={blockId ? `Reemplazar ${cur?.name_es ?? ''}` : 'Agregar'} title="Elegí un ejercicio" />
      {blockId ? (
        <Text variant="small" style={{ marginTop: -space.md, marginBottom: space.lg }}>
          Cambiar el ejercicio reinicia su progresión: la primera sesión te sugiere el peso desde cero.
        </Text>
      ) : null}
      <Field label="Buscar" value={q} onChangeText={setQ} placeholder="Press, remo, sentadilla…" autoCorrect={false} />
      <ChipGroup label="Músculo" scroll value={m} onChange={(v) => setMuscle(v === m ? '' : v)}
        options={MUSCLES.map((x) => ({ value: x, label: MUSCLE_ES[x] ?? x }))} />
    </View>
  );

  // los primeros ítems entran escalonados solo al abrir la pantalla
  const entering = useEnterWindow();
  const headerH = useRef(0);
  const byId = new Map(data.map((e) => [e.id, e]));
  const onPick = (id: string) => { const e = byId.get(id); return e ? pick(e) : undefined; };

  return (
    <Screen scroll={false}>
      <FlatList
        data={data}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={<View onLayout={(e) => { headerH.current = e.nativeEvent.layout.height; }}>{header}</View>}
        ListEmptyComponent={isLoading ? undefined : <EmptyState title="No encontré ejercicios" text="Probá con otra palabra o sacá el filtro de músculo." />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews
        getItemLayout={(_, index) => ({ length: EXERCISE_ROW_H, offset: headerH.current + EXERCISE_ROW_H * index, index })}
        style={{ marginHorizontal: -gutter, paddingHorizontal: gutter, backgroundColor: colors.bg }}
        contentContainerStyle={{ paddingBottom: space.xxxl }}
        renderItem={({ item, index }) => (
          <FadeIn index={index} animate={entering()} distance={8} duration={200}>
            <ExerciseRow id={item.id} name={item.name_es} images={item.images}
              hint={[
                parseJson<string[]>(item.primary_muscles, []).map((x) => MUSCLE_ES[x] ?? x).join(', '),
                item.equipment ? EQUIPMENT_ES[item.equipment] ?? item.equipment : null,
              ].filter(Boolean).join(' · ')}
              value={
                <Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel={`Ver cómo se hace ${item.name_es}`}
                  onPress={() => { haptic.tap(); router.push({ pathname: '/ejercicio/[id]', params: { id: item.id } }); }}>
                  <Text variant="label" style={{ color: colors.text }}>Ver</Text>
                </Pressable>
              }
              onPress={onPick} />
          </FadeIn>
        )}
      />
    </Screen>
  );
}
