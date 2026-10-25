import { usePowerSync, useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { deleteBlock, duplicateBlock, moveBlock, renameDay } from '@/routine/edit';
import { line, space } from '@/theme';
import { Button, EmptyState, Field, Header, Screen, Section, Text, confirmDestructive, haptic } from '@/ui';
import { fmtClock } from '@/workout/useRestTimer';
import { parseJson } from '@/workout/data';
import { ExerciseThumb, dimWhenPressed, useRipple, useTheme } from '@/ui';
import { friendlyError } from '@/ui/feedback';

type B = {
  id: string; position: number; exercise_name: string; images: string | null; sets: number; reps_min: number; reps_max: number;
  rep_unit: string; rest_sec: number; intensity: string; group_key: string | null; technique: string | null;
};

const err = (e: unknown) => Alert.alert('No se guardó', friendlyError(e));

function intensityLabel(raw: string) {
  const i = parseJson<{ type: string; value?: number | null }>(raw, { type: 'none' });
  if (i.type === 'rir') return `RIR ${i.value}`;
  if (i.type === 'rpe') return `RPE ${String(i.value).replace('.', ',')}`;
  if (i.type === 'pct_1rm') return `${Math.round((i.value ?? 0) * 100)}% 1RM`;
  if (i.type === 'pct_tm') return i.value ? `${Math.round(i.value * 100)}% TM` : 'ola 5/3/1';
  return null;
}

export default function Dia() {
  const { colors } = useTheme();
  const ripple = useRipple();
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = usePowerSync();
  const { data: days } = useQuery<{ name: string; routine_name: string }>(
    `SELECT d.name, r.name AS routine_name FROM user_routine_days d JOIN user_routines r ON r.id = d.routine_id WHERE d.id = ?`, [id],
  );
  const { data: blocks } = useQuery<B>(
    `SELECT b.id, b.position, e.name_es AS exercise_name, e.images, b.sets, b.reps_min, b.reps_max, b.rep_unit, b.rest_sec,
            b.intensity, b.group_key, t.name AS technique
     FROM user_routine_blocks b JOIN exercises e ON e.id = b.exercise_id
     LEFT JOIN techniques t ON t.id = b.technique_id
     WHERE b.routine_day_id = ? AND b.deleted_at IS NULL ORDER BY b.position`,
    [id],
  );
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const day = days[0];
  if (!day) return <Screen><Header title="Cargando" /></Screen>;

  const totalSets = blocks.reduce((a, b) => a + b.sets, 0);
  const estMin = Math.round(blocks.reduce((a, b) => a + b.sets * (45 + b.rest_sec), 0) / 60);

  function actions(b: B) {
    haptic.tap();
    Alert.alert(b.exercise_name, '¿Qué querés hacer con este ejercicio?', [
      { text: 'Duplicar', onPress: () => duplicateBlock(db, b.id).catch(err) },
      { text: 'Cambiar ejercicio', onPress: () => router.push({ pathname: '/rutina/elegir', params: { blockId: b.id } }) },
      { text: 'Borrar', style: 'destructive', onPress: () => confirmDestructive({
        title: 'Borrar ejercicio',
        message: `Se saca «${b.exercise_name}» (${b.sets} series) de este día. Tu historial con ese ejercicio queda.`,
        onConfirm: () => deleteBlock(db, b.id).catch(err),
      }) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  return (
    <Screen>
      <Header label={day.routine_name} title={day.name} />
      <Text variant="small" style={{ marginTop: -space.md, marginBottom: space.lg }}>
        {blocks.length} ejercicios · {totalSets} series · ~{estMin} min
      </Text>

      {editing ? (
        <View style={{ marginBottom: space.lg }}>
          <Field label="Nombre del día" value={name} onChangeText={setName} autoFocus maxLength={40} />
          <Button label="Guardar nombre" disabled={!name.trim()}
            onPress={() => renameDay(db, id, name.trim()).then(() => setEditing(false)).catch(err)} />
          <Button variant="ghost" label="Cancelar" onPress={() => setEditing(false)} style={{ marginTop: space.xs }} />
        </View>
      ) : (
        <Pressable onPress={() => { setName(day.name); setEditing(true); }} hitSlop={12} accessibilityRole="button"
          style={({ pressed }) => [{ marginBottom: space.lg, paddingVertical: space.sm, alignSelf: 'flex-start' }, pressed && { opacity: 0.55 }]}>
          <Text variant="label">Cambiar nombre</Text>
        </Pressable>
      )}

      <Section label="Ejercicios · tocá para editar, mantené apretado para más">
        {!blocks.length ? (
          <EmptyState title="Este día está vacío" text="Tocá «Agregar ejercicio» para sumar el primero." />
        ) : null}
        {blocks.map((b, i) => {
          const tag = b.group_key ? `${b.group_key}` : String(b.position).padStart(2, '0');
          return (
            <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: line, borderBottomColor: colors.line }}>
              <Pressable android_ripple={ripple} style={({ pressed }) => [{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.lg }, dimWhenPressed(pressed)]}
                accessibilityRole="button" accessibilityHint="Mantené apretado para duplicar, cambiar o borrar"
                onPress={() => router.push({ pathname: '/rutina/bloque/[id]', params: { id: b.id } })}
                onLongPress={() => actions(b)} delayLongPress={400}>
                <Text variant="numberSm" tone="disabled" numberOfLines={1} style={{ minWidth: 28, flexShrink: 0 }}>{tag}</Text>
                <ExerciseThumb images={b.images} name={b.exercise_name} size={48} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="body">{b.exercise_name}</Text>
                  <Text variant="small">
                    {[
                      `${b.sets} × ${b.reps_min === b.reps_max ? b.reps_min : `${b.reps_min}-${b.reps_max}`}${b.rep_unit === 'sec' ? ' s' : ''}`,
                      intensityLabel(b.intensity), fmtClock(b.rest_sec), b.technique,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </Pressable>
              <Pressable android_ripple={ripple} hitSlop={8} disabled={i === 0} onPress={() => { haptic.select(); moveBlock(db, b.id, -1).catch(err); }}
                accessibilityRole="button" accessibilityLabel="Subir"
                style={({ pressed }) => [{ paddingHorizontal: space.md, minHeight: 44, justifyContent: 'center' }, dimWhenPressed(pressed, 0.5)]}>
                <Text variant="numberSm" tone={i === 0 ? 'disabled' : 'secondary'}>↑</Text>
              </Pressable>
              <Pressable android_ripple={ripple} hitSlop={8} disabled={i === blocks.length - 1} onPress={() => { haptic.select(); moveBlock(db, b.id, 1).catch(err); }}
                accessibilityRole="button" accessibilityLabel="Bajar"
                style={({ pressed }) => [{ paddingLeft: space.md, minHeight: 44, justifyContent: 'center' }, dimWhenPressed(pressed, 0.5)]}>
                <Text variant="numberSm" tone={i === blocks.length - 1 ? 'disabled' : 'secondary'}>↓</Text>
              </Pressable>
            </View>
          );
        })}
      </Section>

      <Button variant="primary" label="Agregar ejercicio" style={{ marginTop: space.xl }}
        onPress={() => router.push({ pathname: '/rutina/elegir', params: { dayId: id } })} />
    </Screen>
  );
}
