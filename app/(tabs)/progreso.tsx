import { usePowerSync, useQuery } from '@powersync/react';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { E1RM_SQL, E1RM_WHERE } from '@/lib/e1rm';
import { towardGoal } from '@/lib/goal';
import { mondayOf } from '@/lib/nutrition';
import { useToday } from '@/lib/useToday';
import { SESSION_DAYS_SQL, addDays, minutesLevel, weekStreaks } from '@/progress/stats';
import { LIFT_ES, type Lift } from '@/lib/strength';
import { recomputeStrength, type StrengthStatus } from '@/progress/strength';
import { space } from '@/theme';
import { Button, ExerciseThumb, Field, Header, LevelIcon, Row, Screen, Section, Text, useTheme, type LevelIconName } from '@/ui';
import { YearHeatmap } from '@/ui/YearHeatmap';
import { BarChart, LineChart } from '@/ui/charts';
import { currentUserId, fmtKg, nowIso } from '@/workout/data';
import { friendlyError } from '@/ui/feedback';

type PR = {
  exercise_id: string; name_es: string; images: string | null; e1rm: number | null; e1rm_14: number | null; max_w: number | null;
  bw_reps: number | null; bw_reps_14: number | null; max_sec: number | null; max_vol: number | null; sessions: number;
};

const kgShort = (v: number) => (v >= 1000 ? `${fmtKg(Math.round(v / 100) / 10)} mil` : `${Math.round(v)}`);

export default function Progreso() {
  const db = usePowerSync();
  const { colors } = useTheme();
  const today = useToday();
  const [day, setDay] = useState<string | null>(null);
  const [status, setStatus] = useState<StrengthStatus | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');

  useFocusEffect(useCallback(() => {
    recomputeStrength(db).then(setStatus).catch(() => setStatus(null));
  }, [db]));

  const { data: me } = useQuery<{ display_name: string | null; icon: string | null; level_name: string | null; uses_accent: number | null; since: string | null; goal: number | null }>(
    `SELECT s.display_name, s.goal_weight_kg AS goal, l.icon, l.name AS level_name, l.uses_accent, s.strength_level_since AS since
     FROM user_settings s LEFT JOIN strength_levels l ON l.slug = s.strength_level LIMIT 1`,
  );
  const u = me[0];

  // Récords por ejercicio: 1RM estimado, peso máximo, mejor sesión (volumen) y, sin peso, reps o segundos
  const RECENT = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-14 days')";
  const { data: prs } = useQuery<PR>(
    `WITH s AS (SELECT * FROM workout_sets WHERE deleted_at IS NULL AND set_type != 'warmup'),
     agg AS (
       SELECT exercise_id,
         max(CASE WHEN ${E1RM_WHERE()} THEN ${E1RM_SQL()} END) AS e1rm,
         max(CASE WHEN ${E1RM_WHERE()} AND completed_at > ${RECENT} THEN ${E1RM_SQL()} END) AS e1rm_14,
         max(CASE WHEN rep_unit = 'reps' AND weight_kg > 0 AND parent_set_id IS NULL THEN weight_kg END) AS max_w,
         max(CASE WHEN rep_unit = 'reps' AND coalesce(weight_kg, 0) = 0 AND parent_set_id IS NULL THEN reps END) AS bw_reps,
         max(CASE WHEN rep_unit = 'reps' AND coalesce(weight_kg, 0) = 0 AND parent_set_id IS NULL
                   AND completed_at > ${RECENT} THEN reps END) AS bw_reps_14,
         max(CASE WHEN rep_unit = 'sec' AND parent_set_id IS NULL THEN reps END) AS max_sec,
         count(DISTINCT session_id) AS sessions
       FROM s GROUP BY exercise_id),
     vol AS (
       SELECT exercise_id, max(v) AS max_vol FROM (
         SELECT exercise_id, session_id, sum(weight_kg * reps) AS v FROM s
         WHERE rep_unit = 'reps' AND weight_kg > 0 GROUP BY exercise_id, session_id)
       GROUP BY exercise_id)
     SELECT agg.*, vol.max_vol, e.name_es, e.images FROM agg
     JOIN exercises e ON e.id = agg.exercise_id
     LEFT JOIN vol ON vol.exercise_id = agg.exercise_id
     ORDER BY (agg.e1rm IS NULL), agg.e1rm DESC, agg.bw_reps DESC, agg.max_sec DESC
     LIMIT 15`,
  );

  // Volumen de las últimas 8 semanas: lunes locales, semanas sin entreno en 0
  const weekStarts = Array.from({ length: 8 }, (_, i) => mondayOf(new Date(Date.now() - (7 - i) * 7 * 86_400_000)));
  const { data: volRows } = useQuery<{ wk: string; v: number }>(
    `SELECT date(completed_at, 'localtime', '-6 days', 'weekday 1') AS wk, sum(weight_kg * reps) AS v
     FROM workout_sets
     WHERE deleted_at IS NULL AND rep_unit = 'reps' AND weight_kg > 0 AND set_type != 'warmup'
       AND date(completed_at, 'localtime') >= ?
     GROUP BY wk`,
    [weekStarts[0]],
  );
  const vol = weekStarts.map((wk) => ({
    label: `${Number(wk.slice(8, 10))}/${Number(wk.slice(5, 7))}`,
    v: volRows.find((r) => r.wk === wk)?.v ?? 0,
  }));

  const { data: weights } = useQuery<{ measured_at: string; weight_kg: number }>(
    `SELECT measured_at, weight_kg FROM body_measurements
     WHERE weight_kg IS NOT NULL AND deleted_at IS NULL AND measured_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-120 days')
     ORDER BY measured_at`,
  );

  const { data: sessions } = useQuery<{ n: number; last30: number }>(
    `SELECT count(*) AS n,
       sum(CASE WHEN started_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days') THEN 1 ELSE 0 END) AS last30
     FROM workout_sessions WHERE deleted_at IS NULL AND ended_at IS NOT NULL`,
  );

  // Calendario del año: minutos entrenados por día (53 semanas)
  const yearFrom = addDays(mondayOf(new Date(`${today}T12:00:00`)), -7 * 52);
  const { data: dayRows } = useQuery<{ d: string; n: number; min: number }>(SESSION_DAYS_SQL, [yearFrom]);
  const { data: allDays } = useQuery<{ d: string }>(
    `SELECT DISTINCT date(started_at, 'localtime') AS d FROM workout_sessions WHERE deleted_at IS NULL AND ended_at IS NOT NULL`,
  );
  const byDay = useMemo(() => new Map(dayRows.map((r) => [r.d, r])), [dayRows]);
  const streak = useMemo(() => weekStreaks(allDays.map((r) => r.d), today), [allDays, today]);
  const yearSessions = dayRows.reduce((a, r) => a + r.n, 0);
  const picked = day ? byDay.get(day) : undefined;
  const goal = me[0]?.goal ?? null;
  const tone = (from: number, to: number) => {
    const t = towardGoal(from, to, goal);
    return t === 'good' ? colors.good : t === 'bad' ? colors.bad : null;
  };

  async function saveName() {
    const v = name.trim().slice(0, 40);
    if (!v) return setEditingName(false);
    try {
      const userId = await currentUserId(db);
      const ts = nowIso();
      const ex = await db.getOptional<{ id: string }>('SELECT id FROM user_settings WHERE id = ?', [userId]);
      if (ex) await db.execute('UPDATE user_settings SET display_name = ?, updated_at = ? WHERE id = ?', [v, ts, userId]);
      else await db.execute(
        `INSERT INTO user_settings (id, user_id, weight_unit, increment_kg, increment_db_kg, equipment, injured_joints, display_name, updated_at)
         VALUES (?, ?, 'kg', 2.5, 2, '[]', '[]', ?, ?)`, [userId, userId, v, ts]);
      setEditingName(false);
    } catch (e) {
      Alert.alert('No se guardó', friendlyError(e));
    }
  }

  // promedio móvil de 7 días (por fecha, no por cantidad de pesajes)
  const pts = weights.map((w) => ({ t: Date.parse(w.measured_at), v: w.weight_kg }));
  const movingAvg = pts.map((p) => {
    const win = pts.filter((q) => q.t <= p.t && q.t > p.t - 7 * 86_400_000);
    return { t: p.t, v: win.reduce((a, q) => a + q.v, 0) / win.length };
  });
  const lastAvg = movingAvg.at(-1);
  const ago = lastAvg ? movingAvg.filter((p) => p.t <= lastAvg.t - 30 * 86_400_000).at(-1) : undefined;
  const trend30 = lastAvg && ago ? Math.round((lastAvg.v - ago.v) * 10) / 10 : null;

  const st = status?.ok ? status : null;
  const lastWeight = weights.at(-1);

  return (
    <Screen>
      <Header
        label="Perfil"
        title={u?.display_name || 'Progreso'}
        right={u?.icon ? <LevelIcon icon={u.icon as LevelIconName} accent={!!u.uses_accent} size={40} /> : null}
      />

      {editingName ? (
        <View>
          <Field label="Tu nombre" value={name} onChangeText={setName} autoFocus maxLength={40} onSubmitEditing={saveName} />
          <Button label="Guardar nombre" onPress={saveName} />
        </View>
      ) : (
        <Row label={u?.display_name ? 'Cambiar nombre' : 'Poné tu nombre'} value="→"
          onPress={() => { setName(u?.display_name ?? ''); setEditingName(true); }} />
      )}

      {/* ----------------------------------------------------------- niveles */}
      <Section label="Nivel de fuerza">
        {status && !status.ok ? (
          <Row label={`Me falta: ${status.missing.join(', ')}`} hint="Se cargan en Comida → Mis datos" value="→"
            onPress={() => router.push('/comida/perfil')} />
        ) : st ? (
          <>
            {/* el ícono (único acento de la pantalla) va junto al nombre, arriba */}
            <View style={{ paddingVertical: space.xl, alignItems: 'center' }}>
              {u?.icon ? <LevelIcon icon={u.icon as LevelIconName} accent={!!u.uses_accent} size={140} /> : null}
              <View style={{ alignItems: 'center', marginTop: space.lg }}>
                <Text variant="title" style={{ fontSize: 40, lineHeight: 46, textAlign: 'center' }}>{st.result.general.level.name}</Text>
                <Text variant="small" style={{ textAlign: 'center' }}>
                  {st.result.general.next && st.result.general.kgToNext != null
                    ? `Para ${st.result.general.next.name}: ${fmtKg(st.result.general.kgToNext)} kg entre ${st.result.general.nextLifts.map((l) => LIFT_ES[l]).join(' y ')}`
                    : 'Nivel máximo'}
                </Text>
                {u?.since ? <Text variant="small" style={{ textAlign: 'center' }}>Desde el {new Date(u.since).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</Text> : null}
              </View>
            </View>
            {st.result.lifts.map((l) => (
              <Row
                key={l.lift}
                label={LIFT_ES[l.lift as Lift]}
                hint={l.best == null
                  ? 'Sin series en los últimos 6 meses'
                  : `${l.level.name} · ${fmtKg(l.ratio)}× tu peso${l.next && l.kgToNext != null ? ` · faltan ${fmtKg(l.kgToNext)} kg para ${l.next.name}` : ''}`}
                value={l.best != null ? `${fmtKg(Math.round(l.best * 2) / 2)} kg` : '—'}
              />
            ))}
            <Text variant="small" style={{ marginTop: space.md }}>
              1RM estimado (Epley con RIR) de los últimos 6 meses contra {fmtKg(st.bodyweightKg)} kg de peso corporal, ajustado por altura.
              El nivel general es el del medio de los tres.
            </Text>
          </>
        ) : null}
      </Section>

      {/* ----------------------------------------------------------- récords */}
      <Section label="Récords">
        {prs.length ? prs.map((p) => {
          const isNew = (p.e1rm != null && p.e1rm_14 != null && p.e1rm_14 >= p.e1rm - 0.01 && p.sessions > 1)
            || (p.bw_reps != null && p.bw_reps_14 != null && p.bw_reps_14 >= p.bw_reps && p.sessions > 1);
          const value = p.e1rm != null ? `${fmtKg(Math.round(p.e1rm * 2) / 2)} kg`
            : p.bw_reps != null ? `${p.bw_reps} reps` : p.max_sec != null ? `${p.max_sec} s` : '—';
          return (
            <Row key={p.exercise_id} label={p.name_es}
              left={<ExerciseThumb images={p.images} name={p.name_es} size={48} />}
              hint={[
                p.e1rm != null ? '1RM est.' : null,
                p.max_w != null ? `máx ${fmtKg(p.max_w)} kg` : null,
                p.max_vol != null ? `mejor sesión ${kgShort(p.max_vol)} kg` : null,
                isNew ? 'nuevo' : null,
              ].filter(Boolean).join(' · ') || undefined}
              value={value}
              onPress={() => router.push({ pathname: '/ejercicio/[id]', params: { id: p.exercise_id } })} />
          );
        }) : <Text variant="small" style={{ paddingVertical: space.lg }}>Terminá una sesión y aparecen acá.</Text>}
      </Section>

      {/* ----------------------------------------------------------- gráficos */}
      <Section label={`Volumen semanal · kg × reps`}>
        <View style={{ paddingTop: space.lg }}>
          <BarChart data={vol} format={kgShort} />
        </View>
        <Row label="Sesiones" hint="Últimos 30 días" value={`${sessions[0]?.last30 ?? 0}`} />
      </Section>

      <Section label="Calendario" count={yearSessions}>
        <View style={{ paddingTop: space.lg }}>
          <YearHeatmap today={today} selected={day} onSelect={(d) => setDay(day === d ? null : d)}
            level={(d) => minutesLevel(byDay.get(d)?.min ?? 0)} />
          <Text variant="small" style={{ marginTop: space.sm }}>
            {day
              ? `${new Date(`${day}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}: ${picked ? `${picked.n > 1 ? `${picked.n} sesiones · ` : ''}${Math.round(picked.min)} min` : 'sin entrenar'}`
              : 'Cada cuadrado es un día; más oscuro, más minutos entrenados. Tocá uno para verlo.'}
          </Text>
        </View>
        <Row label="Racha actual" hint="Semanas seguidas con al menos una sesión" value={`${streak.current} ${streak.current === 1 ? 'semana' : 'semanas'}`} />
        <Row label="Mejor racha" value={`${streak.best} ${streak.best === 1 ? 'semana' : 'semanas'}`} />
      </Section>

      <Section label="Músculos">
        <Row label="Mapa muscular" hint="Qué músculos trabajaste en los últimos 7 días" value="→"
          onPress={() => router.push('/progreso/musculos')} />
      </Section>

      <Section label={lastWeight ? `Peso corporal · ${fmtKg(lastWeight.weight_kg)} kg` : 'Peso corporal'}>
        <View style={{ paddingTop: space.lg }}>
          <LineChart data={movingAvg} dots={weights.length > 1 ? weights.map((w) => ({ t: Date.parse(w.measured_at), v: w.weight_kg })) : []}
            goal={goal} segmentColor={goal != null ? tone : undefined}
            format={(v) => fmtKg(Math.round(v * 10) / 10)} empty="Registrá tu peso en Medidas o en Comida" />
          {movingAvg.length > 1 ? (
            <Text variant="small" style={{ marginTop: space.sm }}>
              Línea: promedio de 7 días · puntos: cada pesaje
              {trend30 != null ? ` · últimos 30 días ${trend30 > 0 ? '+' : ''}${fmtKg(trend30)} kg` : ''}
              {goal != null ? ` · verde: hacia la meta de ${fmtKg(goal)} kg, rojo: en contra` : ''}
            </Text>
          ) : null}
        </View>
      </Section>

      <Section label="Datos">
        <Row label="Medidas" hint="Peso, meta, cintura, brazos, % de grasa" value="→" onPress={() => router.push('/progreso/medidas')} />
        <Row label="1RM y training max" hint="Cargados y estimados" value="→" onPress={() => router.push('/progreso/maximos')} />
        <Row label="Ajustes" hint="Cargas, sesión" value="→" onPress={() => router.push('/ajustes')} />
      </Section>
    </Screen>
  );
}
