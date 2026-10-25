import { usePowerSync, useQuery } from '@powersync/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import {
  WEEK_PRESET, addDay, deleteDay, deleteRoutine, endPlan, moveDay, renameRoutine, setActiveRoutine, weekOf, type WeekKind,
} from '@/routine/edit';
import { space } from '@/theme';
import { Button, EmptyState, Field, Header, HelpDot, Row, Screen, Section, Text, confirmDestructive, dimWhenPressed, useRipple } from '@/ui';
import { friendlyError } from '@/ui/feedback';

type R = { id: string; name: string; is_active: number; method_name: string | null };
type D = { id: string; day_index: number; name: string; blocks: number; sets: number };
type P = { id: string; name: string; start_date: string; weeks: number };
type W = { week_index: number; kind: WeekKind };

const err = (e: unknown) => Alert.alert('No se guardó', friendlyError(e));

export default function Rutina() {
  const db = usePowerSync();
  const ripple = useRipple();
  const { data: routines } = useQuery<R>(
    `SELECT r.id, r.name, r.is_active, m.name AS method_name FROM user_routines r
     LEFT JOIN methods m ON m.id = r.method_id
     WHERE r.deleted_at IS NULL ORDER BY r.is_active DESC, r.created_at DESC`,
  );
  const active = routines.find((r) => r.is_active) ?? routines[0];
  const { data: days } = useQuery<D>(
    `SELECT d.id, d.day_index, d.name,
       (SELECT count(*) FROM user_routine_blocks b WHERE b.routine_day_id = d.id AND b.deleted_at IS NULL) AS blocks,
       (SELECT coalesce(sum(sets), 0) FROM user_routine_blocks b WHERE b.routine_day_id = d.id AND b.deleted_at IS NULL) AS sets
     FROM user_routine_days d WHERE d.routine_id = ? AND d.deleted_at IS NULL ORDER BY d.day_index`,
    [active?.id ?? ''],
  );
  const { data: plans } = useQuery<P>(
    `SELECT id, name, start_date, weeks FROM plans WHERE routine_id = ? AND status = 'activo' AND deleted_at IS NULL LIMIT 1`,
    [active?.id ?? ''],
  );
  const plan = plans[0];
  const { data: weeks } = useQuery<W>(
    'SELECT week_index, kind FROM plan_weeks WHERE plan_id = ? AND deleted_at IS NULL ORDER BY week_index', [plan?.id ?? ''],
  );

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [newDay, setNewDay] = useState<string | null>(null);

  if (!active) {
    return (
      <Screen>
        <Header label="Rutina" title="Sin rutina" />
        <Text variant="body" tone="secondary">Cargá un método o armá una rutina y después la editás acá.</Text>
        <Button variant="primary" label="Armar mi rutina" onPress={() => router.replace('/armador')} style={{ marginTop: space.xl }} />
      </Screen>
    );
  }

  const cur = plan ? weekOf(plan.start_date, plan.weeks) : null;

  function confirmDeleteDay(d: D) {
    confirmDestructive({
      title: 'Borrar día',
      message: `Se borra «${d.name}» y sus ${d.blocks} ejercicios de la rutina. Las sesiones que ya hiciste quedan.`,
      confirmLabel: 'Borrar día',
      onConfirm: () => deleteDay(db, d.id).catch(err),
    });
  }

  function confirmDeleteRoutine(r: R) {
    confirmDestructive({
      title: 'Borrar rutina',
      message: `Se borra la rutina «${r.name}» con todos sus días y ejercicios. Tus sesiones y récords quedan.`,
      confirmLabel: 'Borrar rutina',
      onConfirm: () => deleteRoutine(db, r.id).catch(err),
    });
  }

  return (
    <Screen>
      <Header label={active.method_name ? `Basada en ${active.method_name}` : 'Rutina propia'} title={active.name} />

      {editingName ? (
        <View>
          <Field label="Nombre de la rutina" value={name} onChangeText={setName} autoFocus maxLength={60} />
          <Button label="Guardar nombre" disabled={!name.trim()}
            onPress={() => renameRoutine(db, active.id, name.trim()).then(() => setEditingName(false)).catch(err)} />
          <Button variant="ghost" label="Cancelar" onPress={() => setEditingName(false)} style={{ marginTop: space.xs }} />
        </View>
      ) : (
        <Row label="Cambiar nombre" value="→" onPress={() => { setName(active.name); setEditingName(true); }} />
      )}

      {/* ----------------------------------------------------------- días */}
      <Section label="Días">
        {!days.length ? (
          <EmptyState title="La rutina no tiene días" text="Agregá un día (ej. «Torso A») y después sumale ejercicios." />
        ) : null}
        {days.map((d, i) => (
          <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Row label={d.name} hint={`${d.blocks} ejercicios · ${d.sets} series`} value="→"
                onPress={() => router.push({ pathname: '/rutina/dia/[id]', params: { id: d.id } })} />
            </View>
            <Pressable android_ripple={ripple} hitSlop={8} disabled={i === 0} onPress={() => moveDay(db, d.id, -1).catch(err)} accessibilityRole="button" accessibilityLabel="Subir día"
              style={({ pressed }) => [{ paddingHorizontal: space.sm, minHeight: 44, justifyContent: 'center' }, dimWhenPressed(pressed, 0.5)]}>
              <Text variant="numberSm" tone={i === 0 ? 'disabled' : 'secondary'}>↑</Text>
            </Pressable>
            <Pressable android_ripple={ripple} hitSlop={8} disabled={i === days.length - 1} onPress={() => moveDay(db, d.id, 1).catch(err)} accessibilityRole="button" accessibilityLabel="Bajar día"
              style={({ pressed }) => [{ paddingHorizontal: space.sm, minHeight: 44, justifyContent: 'center' }, dimWhenPressed(pressed, 0.5)]}>
              <Text variant="numberSm" tone={i === days.length - 1 ? 'disabled' : 'secondary'}>↓</Text>
            </Pressable>
            <Pressable android_ripple={ripple} hitSlop={8} onPress={() => confirmDeleteDay(d)} accessibilityRole="button" accessibilityLabel={`Borrar ${d.name}`}
              style={({ pressed }) => [{ paddingLeft: space.sm, minHeight: 44, justifyContent: 'center' }, dimWhenPressed(pressed, 0.5)]}>
              <Text variant="label">Borrar</Text>
            </Pressable>
          </View>
        ))}
        {newDay != null ? (
          <View style={{ paddingTop: space.lg }}>
            <Field label="Nombre del día" value={newDay} onChangeText={setNewDay} autoFocus placeholder="Torso C" />
            <Button label="Agregar día" disabled={!newDay.trim()} onPress={() =>
              addDay(db, active.id, newDay.trim()).then((id) => {
                setNewDay(null);
                router.push({ pathname: '/rutina/dia/[id]', params: { id } });
              }).catch(err)} />
            <Button variant="ghost" label="Cancelar" onPress={() => setNewDay(null)} style={{ marginTop: space.xs }} />
          </View>
        ) : (
          <Row label="+ Agregar día" onPress={() => setNewDay('')} />
        )}
      </Section>

      {/* ----------------------------------------------------------- mesociclo */}
      <Section label="Mesociclo" help="mesociclo">
        {plan ? (
          <>
            <Row label={plan.name}
              hint={cur ? `Semana ${cur} de ${plan.weeks}` : `Empieza el ${new Date(`${plan.start_date}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`} />
            {weeks.map((w) => (
              <Row key={w.week_index}
                label={`${w.week_index === cur ? '→ ' : ''}Semana ${w.week_index}`}
                hint={WEEK_PRESET[w.kind].hint}
                value={WEEK_PRESET[w.kind].label} />
            ))}
            <Button variant="ghost" label="Terminar mesociclo" style={{ marginTop: space.md }}
              onPress={() => Alert.alert('Terminar mesociclo', 'Las sesiones siguientes vuelven a la prescripción normal.', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Terminar', onPress: () => endPlan(db, plan.id).catch(err) },
              ])} />
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md }}>
              <Text variant="small" style={{ flex: 1 }}>
                Sin mesociclo: cada sesión usa la progresión normal. Con uno, el motor baja series y peso en la semana de descarga.
              </Text>
              <HelpDot term="descarga" />
            </View>
            <Button variant="primary" label="Armar mesociclo" onPress={() => router.push({ pathname: '/rutina/plan', params: { routineId: active.id } })} />
          </>
        )}
      </Section>

      {/* ----------------------------------------------------------- otras rutinas */}
      {routines.length > 1 ? (
        <Section label="Otras rutinas">
          {routines.filter((r) => r.id !== active.id).map((r) => (
            <Row key={r.id} label={r.name} hint={r.method_name ?? 'Rutina propia'} value="Usar"
              onPress={() => Alert.alert('Cambiar de rutina', `¿Pasás a entrenar con «${r.name}»? La actual queda guardada en esta lista.`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Usar', onPress: () => { setActiveRoutine(db, r.id).catch(err); } },
              ])} />
          ))}
        </Section>
      ) : null}

      <Section label="Rutina">
        <Row label="Armar otra con el armador" value="→" onPress={() => router.push('/armador')} />
        <Row label="Cargar otro método" value="→" onPress={() => router.push('/biblioteca')} />
        <Button variant="ghost" label="Borrar esta rutina" onPress={() => confirmDeleteRoutine(active)} style={{ marginTop: space.md }} />
      </Section>
    </Screen>
  );
}
