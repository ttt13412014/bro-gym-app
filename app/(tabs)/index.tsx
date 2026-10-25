import { usePowerSync, useQuery } from '@powersync/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { E1RM_SQL, E1RM_WHERE } from '@/lib/e1rm';
import { mondayOf } from '@/lib/nutrition';
import { useToday } from '@/lib/useToday';
import { addDays, weekStreaks } from '@/progress/stats';
import { line, radius, space } from '@/theme';
import {
  Button, Chip, EmptyState, ExerciseThumb, FadeIn, Header, HelpDot, Row, Screen, Section, SyncStatus, Text, UserBadge, confirmDestructive, haptic, useTheme,
} from '@/ui';
import { useTapGuard } from '@/ui/useTapGuard';
import { closeStaleSession, fmtKg, startSession } from '@/workout/data';
import { moveDay, parseOverrides, pendingMove, undoMove } from '@/workout/dayMove';
import { WEEK_PRESET, weekOf, type WeekKind } from '@/routine/edit';
import { friendlyError } from '@/ui/feedback';

type Routine = { id: string; name: string; recovery_days_min: number };
type Day = { id: string; day_index: number; name: string; blocks: number };
type Last = { id: string; routine_day_id: string | null; ended_at: string | null; started_at: string };
type WeekSession = { id: string; d: string; started_at: string; ended_at: string | null; name: string | null; sets: number; vol: number | null };
type PR = { name_es: string; e: number; weight_kg: number; reps: number; completed_at: string };

const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', opts);
const kgShort = (v: number) => (v >= 1000 ? `${fmtKg(Math.round(v / 100) / 10)} mil` : `${Math.round(v)}`);

export default function Entrenar() {
  const db = usePowerSync();
  const { colors } = useTheme();
  const today = useToday();
  const monday = mondayOf(new Date(`${today}T12:00:00`));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const [starting, setStarting] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  // "Números y otros días" plegado por defecto; se recuerda en el teléfono
  const [more, setMore] = useState(false);
  useEffect(() => { AsyncStorage.getItem('bro.home.more').then((v) => { if (v === '1') setMore(true); }).catch(() => {}); }, []);
  const toggleMore = (v: boolean) => { haptic.select(); setMore(v); AsyncStorage.setItem('bro.home.more', v ? '1' : '0').catch(() => {}); };

  const { data: routines } = useQuery<Routine>(
    `SELECT id, name, recovery_days_min FROM user_routines
     WHERE is_active = 1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
  );
  const routine = routines[0];

  const { data: days } = useQuery<Day>(
    `SELECT d.id, d.day_index, d.name,
       (SELECT count(*) FROM user_routine_blocks b WHERE b.routine_day_id = d.id AND b.deleted_at IS NULL) AS blocks
     FROM user_routine_days d WHERE d.routine_id = ? AND d.deleted_at IS NULL ORDER BY d.day_index`,
    [routine?.id ?? ''],
  );

  const { data: lastRows } = useQuery<Last>(
    `SELECT id, routine_day_id, ended_at, started_at FROM workout_sessions
     WHERE routine_id = ? AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1`,
    [routine?.id ?? ''],
  );
  const last = lastRows[0];
  const open = last && !last.ended_at ? last : null;
  // abierta hace más de 12 h: casi seguro quedó olvidada
  const stale = open && Date.now() - Date.parse(open.started_at) > 12 * 3_600_000;

  // Días movidos (por única vez)
  const { data: setRows } = useQuery<{ day_overrides: string | null }>('SELECT day_overrides FROM user_settings LIMIT 1');
  const overrides = useMemo(() => parseOverrides(setRows[0]?.day_overrides), [setRows]);

  // Sesiones de esta semana (lunes a domingo) para la tira y las tarjetas
  const { data: weekSessions } = useQuery<WeekSession>(
    `SELECT s.id, date(s.started_at, 'localtime') AS d, s.started_at, s.ended_at, d.name,
       (SELECT count(*) FROM workout_sets w WHERE w.session_id = s.id AND w.deleted_at IS NULL AND w.set_type != 'warmup' AND w.parent_set_id IS NULL) AS sets,
       (SELECT sum(w.weight_kg * w.reps) FROM workout_sets w WHERE w.session_id = s.id AND w.deleted_at IS NULL
          AND w.set_type != 'warmup' AND w.rep_unit = 'reps' AND w.weight_kg > 0) AS vol
     FROM workout_sessions s LEFT JOIN user_routine_days d ON d.id = s.routine_day_id
     WHERE s.deleted_at IS NULL AND date(s.started_at, 'localtime') >= ? ORDER BY s.started_at`,
    [monday],
  );
  const doneToday = weekSessions.filter((s) => s.d === today && s.ended_at);

  // Próximo día: el siguiente al último hecho (rota)
  const lastIdx = days.findIndex((d) => d.id === last?.routine_day_id);
  const next = days.length ? days[(lastIdx + 1) % days.length] : undefined;

  // Si hoy le pasaste un entreno de otro día, toca ese (mientras no hayas entrenado hoy)
  const ovToday = overrides[today];
  const movedHere = ovToday?.day && !ovToday.rest && !doneToday.length ? days.find((d) => d.id === ovToday.day) : undefined;
  // Descanso hoy: lo pasaste hoy a otro día, o lo pasaste antes a una fecha que todavía no llegó
  // (sin esto, los días del medio volvían a ofrecer el mismo entreno porque la rotación no cambió)
  const restInfo = ovToday?.rest
    ? { origin: today, to: ovToday.to, day: ovToday.day }
    : !movedHere ? pendingMove(overrides, today, next?.id) : null;
  const planned = movedHere ?? next;
  const restToday = !!restInfo && !doneToday.length && !open;

  // Recuperación mínima del método
  const daysSince = last?.ended_at ? (Date.now() - Date.parse(last.ended_at)) / 86_400_000 : Infinity;
  const waitDays = routine ? Math.ceil(routine.recovery_days_min - daysSince) : 0;
  const tooSoon = !open && waitDays > 0;

  // Mesociclo activo: semana actual y tipo
  // ejercicios del día que toca (miniaturas en la tarjeta de hoy)
  const { data: todayEx } = useQuery<{ id: string; exercise_id: string; name_es: string; images: string | null }>(
    `SELECT b.id, b.exercise_id, e.name_es, e.images FROM user_routine_blocks b JOIN exercises e ON e.id = b.exercise_id
     WHERE b.routine_day_id = ? AND b.deleted_at IS NULL ORDER BY b.position`,
    [planned?.id ?? ''],
  );
  const { data: planRows } = useQuery<{ start_date: string; weeks: number; id: string }>(
    `SELECT id, start_date, weeks FROM plans WHERE routine_id = ? AND status = 'activo' AND deleted_at IS NULL LIMIT 1`,
    [routine?.id ?? ''],
  );
  const plan = planRows[0];
  const mesoWeek = plan ? weekOf(plan.start_date, plan.weeks) : null;
  const { data: weekRows } = useQuery<{ kind: WeekKind }>(
    'SELECT kind FROM plan_weeks WHERE plan_id = ? AND week_index = ? AND deleted_at IS NULL', [plan?.id ?? '', mesoWeek ?? 0],
  );
  const weekKind = weekRows[0]?.kind;

  // Tarjetas: racha (semanas), volumen de la semana, último récord
  const { data: allDays } = useQuery<{ d: string }>(
    `SELECT DISTINCT date(started_at, 'localtime') AS d FROM workout_sessions WHERE deleted_at IS NULL AND ended_at IS NOT NULL`,
  );
  const streak = useMemo(() => weekStreaks(allDays.map((r) => r.d), today), [allDays, today]);
  // Último récord: recorre todo el historial, así que se lee al volver a la pantalla
  // y no queda escuchando cada serie que se carga durante la sesión (Inicio sigue montado debajo)
  const [pr, setPr] = useState<PR | null>(null);
  useFocusEffect(useCallback(() => {
    let alive = true;
    db.getOptional<PR>(
    `WITH s AS (
       SELECT exercise_id, completed_at, weight_kg, reps, ${E1RM_SQL()} AS e FROM workout_sets WHERE ${E1RM_WHERE()}),
     w AS (
       SELECT *, max(e) OVER (PARTITION BY exercise_id ORDER BY completed_at ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev FROM s)
     SELECT x.name_es, w.e, w.weight_kg, w.reps, w.completed_at FROM w JOIN exercises x ON x.id = w.exercise_id
     WHERE w.prev IS NOT NULL AND w.e > w.prev + 0.01
     ORDER BY w.completed_at DESC LIMIT 1`,
    ).then((r) => { if (alive) setPr(r); }).catch(() => {});
    return () => { alive = false; };
  }, [db]));
  const finishedWeek = weekSessions.filter((s) => s.ended_at);
  const volWeek = weekSessions.reduce((a, s) => a + (s.vol ?? 0), 0);

  async function start(dayId: string) {
    if (!routine || starting) return;
    setStarting(dayId);
    try {
      // entrenar hoy deja sin efecto el "lo pasé a otro día" (también si lo habías pasado antes de hoy)
      if (restInfo) await undoMove(db, overrides, restInfo.origin, today);
      const id = await startSession(db, routine.id, dayId);
      router.push({ pathname: '/sesion/[id]', params: { id } });
    } catch (e) {
      Alert.alert('No se pudo empezar', friendlyError(e));
    } finally {
      setStarting(null);
    }
  }

  const move = useTapGuard(async (to: string) => {
    if (!planned) return;
    await moveDay(db, overrides, today, planned.id, to);
    haptic.success();
    setMoving(false);
    setPicked(null);
  });
  const undo = useTapGuard(async (date: string) => {
    await undoMove(db, overrides, date, today);
    haptic.tap();
  });

  if (!routine) {
    return (
      <Screen>
        <Header label="Hoy" title="Entrenar" right={<SyncStatus />} />
        <Text variant="body" tone="secondary">Todavía no tenés rutina. Elegí un método en la biblioteca y se carga con un toque.</Text>
        <Button label="Ir a la biblioteca" onPress={() => router.push('/biblioteca')} style={{ marginTop: space.xl }} />
      </Screen>
    );
  }

  const card = { borderWidth: line, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface, padding: space.lg } as const;
  const bigTitle = { fontSize: 36, lineHeight: 40 } as const;
  const daysName = (id?: string) => days.find((d) => d.id === id)?.name ?? 'el entreno';

  // ------------------------------------------------------------------ hoy
  let hero: React.ReactNode;
  if (open) {
    hero = (
      <View style={card}>
        <Text variant="label">En curso</Text>
        <Text variant="title" style={[bigTitle, { marginTop: space.sm }]}>{days.find((d) => d.id === open.routine_day_id)?.name ?? 'Sesión'}</Text>
        <Text variant="small" style={{ marginTop: space.xs }}>
          {stale
            ? `Quedó abierta desde el ${new Date(open.started_at).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}`
            : `Empezó ${new Date(open.started_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
        </Text>
        <Button variant="primary" label="Continuar sesión" style={{ marginTop: space.xl }}
          onPress={() => router.push({ pathname: '/sesion/[id]', params: { id: open.id } })} />
        {stale ? (
          <Button variant="ghost" label="Cerrarla con lo que hice" style={{ marginTop: space.sm }}
            onPress={() => confirmDestructive({
              title: 'Cerrar sesión vieja',
              message: 'Se guarda lo que cargaste y se cierra a la hora de tu última serie. Después podés empezar la de hoy.',
              confirmLabel: 'Cerrar',
              onConfirm: () => closeStaleSession(db, open.id),
            })} />
        ) : null}
      </View>
    );
  } else if (restToday && restInfo) {
    const restDay = days.find((d) => d.id === restInfo.day);
    hero = (
      <View style={card}>
        <Text variant="label">Hoy · descanso</Text>
        <Text variant="title" style={[bigTitle, { marginTop: space.sm }]}>Día libre</Text>
        <Text variant="small" style={{ marginTop: space.xs }}>
          {daysName(restInfo.day)} queda para el {restInfo.to ? dayLabel(restInfo.to) : 'otro día'}. La rutina no cambia.
        </Text>
        {restDay?.blocks ? (
          <Button variant="secondary" label={`Entrenar ${restDay.name} hoy`} loading={starting === restDay.id} style={{ marginTop: space.xl }}
            onPress={() => start(restDay.id)} />
        ) : null}
        <Button variant="ghost" label="Deshacer el cambio" loading={undo.busy} style={{ marginTop: space.sm }}
          onPress={() => undo.run(restInfo.origin)} />
      </View>
    );
  } else if (planned) {
    const label = doneToday.length
      ? `Hoy ya entrenaste · lo próximo`
      : tooSoon ? `Todavía no te toca · faltan ${waitDays} ${waitDays === 1 ? 'día' : 'días'}`
      : movedHere && ovToday?.from ? `Te toca · lo pasaste del ${dayLabel(ovToday.from, { weekday: 'long' })}` : 'Te toca hoy';
    hero = (
      <View style={card}>
        <Text variant="label">{label}</Text>
        <Text variant="title" style={[bigTitle, { marginTop: space.sm }]}>{planned.name}</Text>
        <Text variant="small" style={{ marginTop: space.xs }}>
          {planned.blocks ? `${planned.blocks} ${planned.blocks === 1 ? 'ejercicio' : 'ejercicios'}` : 'Sin ejercicios todavía'}
          {doneToday.length ? ` · hoy: ${doneToday.map((s) => s.name ?? 'Sesión').join(', ')}` : ''}
        </Text>
        {todayEx.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }}
            contentContainerStyle={{ gap: space.sm }}>
            {todayEx.map((x) => (
              <Pressable key={x.id} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Ver cómo se hace ${x.name_es}`}
                onPress={() => router.push({ pathname: '/ejercicio/[id]', params: { id: x.exercise_id } })}
                style={({ pressed }) => pressed && { opacity: 0.55 }}>
                <ExerciseThumb images={x.images} name={x.name_es} size={48} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        {planned.blocks ? (
          <Button
            variant={tooSoon || doneToday.length ? 'secondary' : 'primary'}
            label={tooSoon ? 'Empezar igual' : 'Empezar sesión'}
            loading={starting === planned.id}
            onPress={() => start(planned.id)}
            style={{ marginTop: space.xl }}
          />
        ) : (
          // un día vacío dejaba una sesión abierta sin nada que hacer
          <Button variant="primary" label="Agregar ejercicios" style={{ marginTop: space.xl }}
            onPress={() => router.push({ pathname: '/rutina/dia/[id]', params: { id: planned.id } })} />
        )}
        {planned.blocks && !doneToday.length ? (
          <Button variant="ghost" label={moving ? 'No mover' : 'Mover a otro día'} style={{ marginTop: space.sm }}
            onPress={() => { haptic.select(); setMoving(!moving); }} />
        ) : null}
        {moving ? (
          <FadeIn>
            <Text variant="small" style={{ marginTop: space.md, marginBottom: space.sm }}>
              ¿A qué día lo pasás? Hoy queda de descanso. Es por única vez: la rutina no se toca.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {[1, 2, 3, 4, 5, 6].map((n) => {
                const d = addDays(today, n);
                return <Chip key={d} label={n === 1 ? 'Mañana' : dayLabel(d)} selected={false} onPress={() => move.run(d)} />;
              })}
            </View>
          </FadeIn>
        ) : null}
      </View>
    );
  } else {
    hero = (
      <EmptyState title="Tu rutina no tiene días" text="Agregale al menos un día con ejercicios para poder entrenar."
        action={<Button label="Editar rutina" onPress={() => router.push('/rutina')} />} />
    );
  }

  // ------------------------------------------------------------------ día elegido en la tira
  const sel = picked;
  const selSessions = sel ? weekSessions.filter((s) => s.d === sel) : [];
  const selOv = sel ? overrides[sel] : undefined;

  return (
    <Screen>
      <Header label={mesoWeek && plan ? `${routine.name} · semana ${mesoWeek}/${plan.weeks}${weekKind ? ` · ${WEEK_PRESET[weekKind].label}` : ''}` : routine.name} title="Entrenar"
        right={<View style={{ alignItems: 'flex-end', gap: space.xs }}><UserBadge accent={false} /><SyncStatus /></View>} />

      <FadeIn>{hero}</FadeIn>

      {weekKind === 'deload' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md }}>
          <Text variant="small" style={{ flex: 1 }}>Semana de descarga: mitad de series y 10% menos de peso. Tu progresión sigue donde estaba.</Text>
          <HelpDot term="descarga" />
        </View>
      ) : null}

      {/* ----------------------------------------------------------- semana */}
      <Section label="Semana">
        <View style={{ flexDirection: 'row', gap: space.xs, paddingTop: space.lg }}>
          {week.map((d, i) => {
            const isToday = d === today;
            const on = picked === d;
            const did = weekSessions.some((s) => s.d === d);
            const ov = overrides[d];
            return (
              <Pressable key={d} accessibilityRole="button"
                accessibilityLabel={`${dayLabel(d)}${did ? ', entrenaste' : ''}${ov?.rest ? ', descanso' : ov?.day ? ', entreno movido' : ''}`}
                onPress={() => { haptic.select(); setPicked(on ? null : d); }}
                style={{
                  flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: space.sm, paddingHorizontal: 2, borderRadius: radius.md, borderWidth: line,
                  borderColor: on ? colors.text : colors.line, backgroundColor: isToday ? colors.text : 'transparent',
                }}>
                <Text variant="label" numberOfLines={1} maxFontSizeMultiplier={1.6} style={{ color: isToday ? colors.bg : colors.textSecondary }}>{LETTERS[i]}</Text>
                <Text variant="numberSm" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: isToday ? colors.bg : d > today ? colors.textSecondary : colors.text }}>{Number(d.slice(8, 10))}</Text>
                <View style={{ height: 6, marginTop: 2, flexDirection: 'row', gap: 2 }}>
                  {did ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isToday ? colors.bg : colors.text }} /> : null}
                  {!did && ov?.day && !ov.rest ? <View style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: isToday ? colors.bg : colors.text }} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text variant="small" style={{ marginTop: space.sm }}>● entrenaste · ○ entreno pasado a ese día · tocá un día para verlo</Text>

        {sel ? (
          <FadeIn key={sel}>
            <View style={{ marginTop: space.md }}>
              <Text variant="bodyStrong">{dayLabel(sel, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
              {selSessions.map((s) => (
                <Row key={s.id} label={s.name ?? 'Sesión'}
                  hint={s.ended_at
                    ? `${Math.max(1, Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60_000))} min · ${s.sets} series${s.vol ? ` · ${kgShort(s.vol)} kg` : ''}`
                    : 'En curso'}
                  value={s.ended_at ? undefined : '→'}
                  onPress={s.ended_at ? undefined : () => router.push({ pathname: '/sesion/[id]', params: { id: s.id } })} />
              ))}
              {selOv?.rest ? (
                <Row label="Descanso" hint={`Pasaste ${daysName(selOv.day)} al ${selOv.to ? dayLabel(selOv.to) : 'otro día'}`}
                  value="Deshacer" onPress={() => undo.run(sel)} />
              ) : null}
              {selOv?.day && !selOv.rest ? (
                <Row label={`${daysName(selOv.day)} (movido)`} hint={selOv.from ? `Lo pasaste del ${dayLabel(selOv.from)}` : undefined}
                  value="Deshacer" onPress={() => undo.run(sel)} />
              ) : null}
              {!selSessions.length && !selOv ? (
                <Text variant="small" style={{ paddingVertical: space.md }}>
                  {sel < today ? 'No entrenaste.' : sel === today ? 'Todavía no entrenaste hoy.' : 'Nada movido a este día.'}
                </Text>
              ) : null}
              {sel === today && planned && planned.blocks && !open && !restToday && !doneToday.length ? (
                <Button variant="ghost" label="Mover el entreno de hoy" onPress={() => { haptic.select(); setMoving(true); setPicked(null); }} />
              ) : null}
            </View>
          </FadeIn>
        ) : null}
      </Section>

      {/* ----------------------------------------------------------- más (plegado: números y otros días) */}
      <Pressable onPress={() => toggleMore(!more)} accessibilityRole="button" accessibilityState={{ expanded: more }}
        style={({ pressed }) => [{
          flexDirection: 'row', alignItems: 'center', marginTop: space.xl, paddingVertical: space.md,
          borderTopWidth: line, borderBottomWidth: line, borderColor: colors.line, opacity: pressed ? 0.6 : 1,
        }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="body">{more ? 'Ver menos' : 'Números de la semana y otros días'}</Text>
          {!more ? (
            <Text variant="small">{finishedWeek.length} {finishedWeek.length === 1 ? 'sesión' : 'sesiones'} · racha {streak.current} {streak.current === 1 ? 'semana' : 'semanas'}</Text>
          ) : null}
        </View>
        <Text variant="numberSm" tone="secondary" style={{ marginLeft: space.md }}>{more ? '−' : '+'}</Text>
      </Pressable>

      {more ? (
        <FadeIn>
          <Section label="Esta semana">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingTop: space.lg }}>
              <Stat label="Sesiones" value={`${finishedWeek.length}`} hint={finishedWeek.length === 1 ? 'terminada' : 'terminadas'} />
              <Stat label="Racha" value={`${streak.current}`} hint={`${streak.current === 1 ? 'semana seguida' : 'semanas seguidas'} · récord ${streak.best}`} />
              <Stat label="Kilos levantados" value={kgShort(volWeek)} hint="peso × reps, esta semana" />
              <Stat label="Último récord" value={pr ? `${fmtKg(Math.round(pr.e * 2) / 2)} kg` : '—'}
                hint={pr ? `${pr.name_es} · ${new Date(pr.completed_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}` : 'Todavía ninguno'}
                onPress={() => router.push('/progreso')} />
            </View>
          </Section>
          {!open && days.length > 1 ? (
            <Section label="Hacer otro día">
              {days.filter((d) => d.id !== planned?.id).map((d) => (
                <Row key={d.id} label={d.name} value={`${d.blocks} ej.`}
                  onPress={() => !d.blocks ? router.push({ pathname: '/rutina/dia/[id]', params: { id: d.id } }) : Alert.alert(`Empezar ${d.name}`, planned ? `Hoy te tocaba ${planned.name}. ¿Empezás ${d.name} igual?` : `¿Empezás ${d.name}?`, [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Empezar', onPress: () => { start(d.id); } },
                  ])} />
              ))}
            </Section>
          ) : null}
        </FadeIn>
      ) : null}

      <Section label="Rutina">
        <Row label="Editar rutina y mesociclo" hint="Ejercicios, series, reps, descansos, semanas de descarga" value="→"
          onPress={() => router.push('/rutina')} />
      </Section>
    </Screen>
  );
}

function Stat({ label, value, hint, onPress }: { label: string; value: string; hint?: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress ? () => { haptic.tap(); onPress(); } : undefined} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={{ flexBasis: '47%', flexGrow: 1, minWidth: 140, borderWidth: line, borderColor: colors.line, borderRadius: radius.md, padding: space.md, backgroundColor: colors.surface }}>
      <Text variant="label">{label}</Text>
      <Text variant="number" style={{ marginTop: space.xs }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {hint ? <Text variant="small" numberOfLines={2}>{hint}</Text> : null}
    </Pressable>
  );
}
