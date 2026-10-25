import { usePowerSync, useQuery } from '@powersync/react';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import type { Result } from '@/lib/progression';
import { space } from '@/theme';
import {
  Button, Divider, EmptyState, ExerciseThumb, FadeIn, Header, RecordBurst, Row, Screen, Section, Text, Tip, confirmDestructive, dimWhenPressed, friendlyError, haptic,
  useRipple, useSeenOnce, type RecordBurstHandle,
} from '@/ui';
import { ExerciseHowTo, RestBar, SetEntry, SetLine, type EffortMode } from '@/workout/components';
import { CameraDock, askCameraPermission, cameraModeAvailable } from '@/workout/camera';
import { isCameraSupported } from '@/workout/cameraSupport';
import { formTarget, type FormSummary } from '@/workout/formCheck';
import { isBarbell } from '@/workout/plates';
import { displayUnits, inGroup, pairBlocks, unpairBlock } from '@/workout/supersets';
import {
  BLOCKS_SQL, SETS_SQL, deleteSet, finishSession, fmtKg, isMainSet, logSet, parseJson, prescribe, setBrokeRecord,
  type BlockRow, type SessionRow, type SessionSummary, type SetRow,
} from '@/workout/data';
import { fmtClock, useNow, useRestTimer } from '@/workout/useRestTimer';
import { ensureNotifications } from '@/lib/notify';
import { recomputeStrength } from '@/progress/strength';
import { useTheme } from '@/ui';

type Suggestion = Result['suggestion'];

// Técnicas que agregan series hijas después de la serie principal
const CHILD: Record<string, { label: string; setType: string; rest: (p: Record<string, unknown>) => number }> = {
  'drop-set': { label: '+ Drop', setType: 'drop', rest: () => 0 },
  'rest-pause': { label: '+ Rest-pause', setType: 'rest_pause', rest: (p) => Number(p.rest_sec ?? 15) },
  'myo-reps': { label: '+ Mini serie', setType: 'myo', rest: () => 15 },
};

const TECH_LABEL: Record<string, string> = {
  'rest-pause': 'Rest-pause', 'drop-set': 'Drop set', superserie: 'Superserie', 'myo-reps': 'Myo-reps',
  piramide: 'Pirámide', negativas: 'Negativas', 'fst7-finisher': 'FST-7',
};

export default function Sesion() {
  const { colors } = useTheme();
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = usePowerSync();
  const timer = useRestTimer();
  const now = useNow(30_000); // minutos del encabezado (antes solo se movían con el descanso)
  // pide permiso de notificaciones una vez, para avisar el fin del descanso con la pantalla apagada
  useEffect(() => { ensureNotifications(true).catch(() => {}); }, []);

  const { data: sessions } = useQuery<SessionRow>('SELECT * FROM workout_sessions WHERE id = ?', [id]);
  const session = sessions[0];
  const { data: blocks, isLoading: blocksLoading, isFetching: blocksFetching } = useQuery<BlockRow>(BLOCKS_SQL, [session?.routine_day_id ?? '']);
  const { data: sets } = useQuery<SetRow>(SETS_SQL, [id]);
  const { data: dayRows } = useQuery<{ name: string }>(
    'SELECT name FROM user_routine_days WHERE id = ?', [session?.routine_day_id ?? ''],
  );

  const [sugg, setSugg] = useState<Record<string, Suggestion>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<Record<string, EffortMode>>({});
  const [child, setChild] = useState<{ blockId: string; parentId: string } | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [levelUp, setLevelUp] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [pairing, setPairing] = useState<string | null>(null); // bloque al que se le busca pareja de superserie
  // modo cámara: prendido para toda la sesión (sigue al ejercicio actual)
  const [cam, setCam] = useState(false);
  const [camAsking, setCamAsking] = useState(false);
  // serie que la cámara vio terminar y todavía no se cargó (sus reps van al campo Reps)
  const [camEnded, setCamEnded] = useState<{ blockId: string; idx: number; reps: number; form: FormSummary | null } | null>(null);
  // el descanso de esa serie ya lo arrancó la cámara: al tocar Hecho no se reinicia
  const camRest = useRef<string | null>(null);
  const camOk = useMemo(() => cameraModeAvailable(), []);
  // la cámara solo cuenta ciertos ejercicios (de pie / cuerpo entero a la vista); ver cameraSupport.ts
  const camSupported = (b: BlockRow) => b.rep_unit !== 'sec' && isCameraSupported({
    name: b.exercise_name_en, name_es: b.exercise_name, category: b.exercise_category, equipment: b.equipment, force: b.exercise_force,
  });
  // avisos que salen una sola vez (de a uno: primero cómo cargar, después lo de la superserie)
  const startTip = useSeenOnce('sesion.inicio');
  const superTip = useSeenOnce('sesion.superserie');
  // salen una sola vez: se dan por vistos apenas aparecen (no hace falta tocar "Entendido")
  const hasBlocks = blocks.length > 0;
  const showStart = hasBlocks && startTip.show;
  const showSuper = !showStart && blocks.length > 1 && superTip.show;
  useEffect(() => { if (showStart) startTip.markSeen(); }, [showStart]);
  useEffect(() => { if (showSuper) superTip.markSeen(); }, [showSuper]);
  const ripple = useRipple();
  // festejo de récord: a lo sumo una vez por serie
  const burst = useRef<RecordBurstHandle>(null);
  const celebrated = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Prescripción de cada bloque (una vez por sesión)
  const blockKey = blocks.map((b) => b.id).join();
  useEffect(() => {
    if (!session || !blocks.length) return;
    let alive = true;
    Promise.all(blocks.map(async (b) => [b.id, await prescribe(db, b, session)] as const)).then((pairs) => {
      if (alive) setSugg(Object.fromEntries(pairs));
    });
    return () => { alive = false; };
  }, [blockKey, session?.id]);

  // Series principales por bloque
  const mainBy = useMemo(() => {
    const m: Record<string, SetRow[]> = {};
    for (const s of sets) if (s.routine_block_id && isMainSet(s)) (m[s.routine_block_id] ??= []).push(s);
    return m;
  }, [sets]);
  const childrenOf = (setId: string) => sets.filter((s) => s.parent_set_id === setId);

  const planned = (b: BlockRow) => sugg[b.id]?.sets.length || b.sets;
  const doneCount = (b: BlockRow) => mainBy[b.id]?.length ?? 0;
  // orden de pantalla: superseries juntas (el "siguiente" también sigue este orden)
  const units = useMemo(() => displayUnits(blocks), [blocks]);
  const ordered = useMemo(() => units.flatMap((u) => u.items), [units]);
  const pending = ordered.filter((b) => doneCount(b) < planned(b));
  const allDone = blocks.length > 0 && pending.length === 0;
  const currentId = openId && blocks.some((b) => b.id === openId) ? openId : pending[0]?.id ?? null;
  const currentBlock = blocks.find((b) => b.id === currentId) ?? null;
  // familia para las correcciones de técnica del ejercicio que se está haciendo (null: solo cuenta)
  const camForm = useMemo(() => (currentBlock && camSupported(currentBlock) ? formTarget({
    name: currentBlock.exercise_name_en, name_es: currentBlock.exercise_name, category: currentBlock.exercise_category,
    equipment: currentBlock.equipment, force: currentBlock.exercise_force,
  }) : null), [currentBlock?.id, currentBlock?.exercise_name]);
  // sin series pendientes no hay nada que contar: se apaga solo
  useEffect(() => { if (allDone && cam) { setCam(false); setCamEnded(null); } }, [allDone, cam]);

  // superserie: letra + número dentro del grupo (A1, A2)
  const groupTag = (b: BlockRow) => {
    if (!b.group_key) return null;
    const members = blocks.filter((x) => x.group_key === b.group_key);
    return members.length > 1 ? `${b.group_key}${members.indexOf(b) + 1}` : null;
  };

  async function pairWith(a: BlockRow, other: BlockRow) {
    try {
      await pairBlocks(db, a, other, blocks);
      haptic.success();
      setPairing(null);
    } catch (e) { Alert.alert('No se armó la superserie', friendlyError(e)); }
  }
  // mantener apretado un ejercicio: elegir pareja de superserie, o separarlo si ya está en una
  function onLongBlock(b: BlockRow) {
    haptic.tap();
    superTip.dismiss();
    if (inGroup(blocks, b)) {
      Alert.alert(`Superserie ${b.group_key}`, b.exercise_name, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Separar de la superserie', onPress: () => { unpair(b); } },
      ]);
      return;
    }
    setPairing(pairing === b.id ? null : b.id);
  }

  async function unpair(b: BlockRow) {
    try {
      await unpairBlock(db, b, blocks);
      haptic.tap();
    } catch (e) { Alert.alert('No se pudo separar', friendlyError(e)); }
  }

  // ¿descansa después de esta serie? En superserie no, hasta cerrar la vuelta (igual que onConfirm)
  function restsAfter(b: BlockRow, idx: number) {
    if (!(b.group_key && inGroup(blocks, b))) return true;
    const group = blocks.filter((x) => x.group_key === b.group_key);
    const pos = group.indexOf(b);
    return !group.slice(pos + 1).some((x) => doneCount(x) < idx && doneCount(x) < planned(x));
  }

  // la cámara vio que paraste: reps al campo y arranca el descanso (la serie se confirma con Hecho)
  function onCamSetEnd(reps: number, form: FormSummary | null) {
    const b = currentBlock;
    if (!b || child || !camSupported(b) || doneCount(b) >= planned(b)) return;
    const idx = doneCount(b) + 1;
    setCamEnded({ blockId: b.id, idx, reps, form });
    if (restsAfter(b, idx) && b.rest_sec > 0) {
      timer.start(b.rest_sec);
      camRest.current = `${b.id}:${idx}`;
    }
  }

  async function toggleCam() {
    if (cam) { haptic.select(); setCam(false); setCamEnded(null); camRest.current = null; return; }
    if (camAsking) return;
    setCamAsking(true);
    try {
      if (await askCameraPermission()) { haptic.success(); setCamEnded(null); setCam(true); }
    } finally { if (alive.current) setCamAsking(false); }
  }

  async function onConfirm(b: BlockRow, v: { weightKg: number | null; reps: number; rir: number | null; rpe: number | null }) {
    if (!session) return;
    const isChild = child?.blockId === b.id;
    const idx = isChild ? (mainBy[b.id]?.length ?? 1) : doneCount(b) + 1;
    const target = !isChild ? sugg[b.id]?.sets[idx - 1] : undefined;
    const tech = b.technique_slug ? CHILD[b.technique_slug] : undefined;

    let setId: string;
    try {
      setId = await logSet(db, {
        sessionId: session.id, block: b, setIndex: idx,
        setType: isChild && tech ? tech.setType : b.set_type,
        parentSetId: isChild ? child!.parentId : null,
        weightKg: v.weightKg, reps: v.reps, rir: v.rir, rpe: v.rpe,
        target: target ? { weight_kg: target.weight_kg, reps: target.reps, rir: sugg[b.id]?.rir_target ?? null } : null,
      });
    } catch (e) {
      haptic.warn();
      Alert.alert('No se guardó la serie', friendlyError(e));
      return;
    }
    haptic.success();
    if (startTip.show) startTip.dismiss();
    // descanso ya arrancado por la cámara para esta misma serie: no se reinicia
    const camKey = `${b.id}:${idx}`;
    const restByCam = !isChild && camRest.current === camKey;
    camRest.current = null;
    if (!isChild) setCamEnded(null);
    // récord: se revisa en segundo plano, no demora el descanso ni el paso al próximo ejercicio
    setBrokeRecord(db, session, b.exercise_id, setId).then((hit) => {
      if (!hit || !alive.current || celebrated.current.has(setId)) return;
      celebrated.current.add(setId);
      burst.current?.play();
    }).catch(() => {});

    if (isChild) {
      setChild(null);
      if (tech) timer.start(tech.rest(parseJson(b.technique_params, {})));
      return;
    }

    // Superserie: pasa al siguiente del grupo sin descanso; descansa al cerrar la vuelta
    if (b.group_key && inGroup(blocks, b)) {
      const group = blocks.filter((x) => x.group_key === b.group_key);
      const pos = group.indexOf(b);
      const nextInRound = group.slice(pos + 1).find((x) => doneCount(x) < idx && doneCount(x) < planned(x));
      if (nextInRound) { setOpenId(nextInRound.id); return; }
      const first = group.find((x) => doneCount(x) + (x.id === b.id ? 1 : 0) < planned(x));
      setOpenId(first?.id ?? null);
    } else if (openId === b.id && idx >= planned(b)) {
      setOpenId(null);
    }
    if (!restByCam) timer.start(b.rest_sec);
  }

  function confirmDelete(s: SetRow) {
    const kids = sets.filter((x) => x.parent_set_id === s.id).length;
    confirmDestructive({
      title: 'Borrar serie',
      message: `Se borra la serie de ${fmtKg(s.weight_kg)} kg × ${s.reps ?? '—'}${s.rep_unit === 'sec' ? ' s' : ''}`
        + `${kids ? ` y ${kids === 1 ? 'su serie extra' : `sus ${kids} series extra`} (drop / mini serie)` : ''}. No se puede deshacer.`,
      confirmLabel: 'Borrar serie',
      onConfirm: () => deleteSet(db, s.id),
    });
  }

  async function finish() {
    if (!session) return;
    const go = async () => {
      setFinishing(true);
      try {
        setSummary(await finishSession(db, session));
        timer.skip();
        // niveles e ícono (solo cambia si cambia el nivel general)
        recomputeStrength(db).then((r) => {
          if (r.ok && r.changed) setLevelUp(r.result.general.level.name);
        }).catch(() => {});
      }
      catch (e) { Alert.alert('No se pudo cerrar la sesión', friendlyError(e)); }
      finally { setFinishing(false); }
    };
    if (allDone) return go();
    Alert.alert('Terminar sesión', 'Quedan series sin hacer. Se guarda lo que hiciste.', [
      { text: 'Seguir', style: 'cancel' },
      { text: 'Terminar', onPress: go },
    ]);
  }

  // ----------------------------------------------------------------- resumen
  if (summary) {
    return (
      <Screen>
        <Header label={dayRows[0]?.name ?? 'Sesión'} title="Sesión terminada" />
        <Section label="Hoy">
          <Row label="Duración" value={`${summary.minutes} min`} />
          <Row label="Series" value={summary.sets} />
          <Row label="Volumen" value={`${summary.volumeKg.toLocaleString('es-AR')} kg`} />
        </Section>
        {levelUp ? (
          <Section label="Nivel de fuerza">
            <Row label={`Ahora sos ${levelUp}`} hint="Mirá el detalle en Progreso" value="→" onPress={() => router.replace('/progreso')} />
          </Section>
        ) : null}
        {summary.prs.length ? (
          <Section label="Récords nuevos">
            {summary.prs.map((p, i) => (
              <Row key={i} label={p.exercise} hint={p.items.join(' · ')} />
            ))}
          </Section>
        ) : null}
        {summary.next.length ? (
          <Section label="Próxima sesión">
            {summary.next.map((n, i) => <Row key={i} label={n.exercise} hint={n.text} />)}
          </Section>
        ) : null}
        <Button variant="primary" label="Listo" onPress={() => router.replace('/')} style={{ marginTop: space.xxl }} />
      </Screen>
    );
  }

  if (!session) return <Screen><Header title="Cargando" /></Screen>;
  if (session.ended_at) {
    return (
      <Screen>
        <Header label="Sesión" title="Ya terminada" />
        <Button label="Volver" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  function renderBlock(b: BlockRow) {
    const open = b.id === currentId;
    const done = mainBy[b.id] ?? [];
    const s = sugg[b.id];
    const n = planned(b);
    const tag = groupTag(b);
    const intensity = parseJson<{ type: string; value?: number | null }>(b.intensity, { type: 'none' });
    const effMode: EffortMode = mode[b.id] ?? (intensity.type === 'rpe' ? 'rpe' : 'rir');
    const finished = done.length >= n;
    const nextTarget = s?.sets[done.length];
    const tech = b.technique_slug ? CHILD[b.technique_slug] : undefined;
    const lastMain = done.at(-1);
    const barbell = isBarbell(b.equipment);
    const grouped = inGroup(blocks, b);

    return (
      <View key={b.id}>
        <Pressable onPress={() => { haptic.select(); setOpenId(open ? null : b.id); }}
          onLongPress={blocks.length > 1 ? () => onLongBlock(b) : undefined} delayLongPress={400}
          accessibilityRole="button" accessibilityState={{ expanded: open }}
          accessibilityHint={blocks.length > 1 ? (grouped ? 'Mantené apretado para separarlo de la superserie' : 'Mantené apretado para hacer superserie') : undefined}
          android_ripple={ripple} style={({ pressed }) => [styles.blockHead, dimWhenPressed(pressed)]}>
          <Text variant="numberSm" tone="disabled" numberOfLines={1} style={{ minWidth: 36, flexShrink: 0 }}>{tag ?? String(b.position).padStart(2, '0')}</Text>
          <ExerciseThumb images={b.images} name={b.exercise_name} size={44} />
          <Text variant="heading" tone={finished && !open ? 'secondary' : 'default'} style={{ flex: 1, minWidth: 0 }}>
            {b.exercise_name}
          </Text>
          <Text variant="numberSm" tone={finished ? 'secondary' : 'default'} style={{ flexShrink: 0 }}>{done.length}/{n}</Text>
        </Pressable>

        {/* superserie: se elige con quién juntarlo (se abre manteniendo apretado el ejercicio) */}
        {pairing === b.id ? (
          <FadeIn style={{ paddingBottom: space.lg }}>
            <Text variant="label" style={{ marginBottom: space.xs }}>Superserie con…</Text>
            {blocks.filter((x) => x.id !== b.id).map((x) => (
              <Row key={x.id} label={x.exercise_name}
                hint={inGroup(blocks, x) ? `Se suma a la superserie ${x.group_key}` : undefined}
                value="+" onPress={() => pairWith(b, x)} />
            ))}
            <Text variant="small" style={{ marginTop: space.sm }}>
              Hacés una serie de cada uno sin descanso y descansás al terminar la vuelta. Queda guardado en el día de la rutina.
            </Text>
            <Button variant="ghost" label="Cancelar" onPress={() => setPairing(null)} style={{ marginTop: space.xs }} />
          </FadeIn>
        ) : null}

        {open ? (
          <View style={{ paddingBottom: space.lg }}>
            {/* foto + pasos: se ve cómo se hace sin salir de la sesión (tocar la foto abre la ficha) */}
            <ExerciseHowTo exerciseId={b.exercise_id} name={b.exercise_name} images={b.images} instructions={b.instructions} />
            <Text variant="label" style={{ marginBottom: space.md }}>
              {[
                `${n} × ${b.reps_min === b.reps_max ? b.reps_min : `${b.reps_min}-${b.reps_max}`}${b.rep_unit === 'sec' ? ' s' : ''}`,
                s?.rir_target != null ? (effMode === 'rpe' ? `RPE ${fmtKg(10 - s.rir_target)}` : `RIR ${s.rir_target}`) : null,
                `${fmtClock(b.rest_sec)} descanso`,
                b.technique_slug ? TECH_LABEL[b.technique_slug] : null,
                b.tempo ? `tempo ${b.tempo}` : null,
              ].filter(Boolean).join(' · ')}
            </Text>

            {/* peso sugerido: el número manda */}
            {!finished ? (
              <View style={{ marginBottom: space.lg }}>
                <Text variant="hero" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{nextTarget?.weight_kg != null ? fmtKg(nextTarget.weight_kg) : '—'}</Text>
                <Text variant="small">
                  {nextTarget?.weight_kg != null ? `kg × ${nextTarget.reps}${nextTarget.amrap ? '+' : ''}` : 'Elegí un peso: la próxima ya te lo sugiero'}
                </Text>
                {s?.note ? <Text variant="small" style={{ color: colors.text, marginTop: space.xs }}>{s.note}</Text> : null}
              </View>
            ) : null}

            {/* series hechas + hijas */}
            {done.map((d, i) => (
              <View key={d.id}>
                <SetLine index={String(i + 1)} weight={d.weight_kg} reps={d.reps} unit={d.rep_unit}
                  effort={d.rir != null ? `RIR ${d.rir}` : d.rpe != null ? `RPE ${fmtKg(d.rpe)}` : null}
                  state="done" onLongPress={() => confirmDelete(d)} />
                {childrenOf(d.id).map((c, j) => (
                  <SetLine key={c.id} child index={`${i + 1}.${j + 1}`} weight={c.weight_kg} reps={c.reps}
                    unit={c.rep_unit} state="done" onLongPress={() => confirmDelete(c)} />
                ))}
              </View>
            ))}

            {done.length ? (
              <Text variant="small" tone="disabled" style={{ paddingTop: space.sm }}>Mantené apretada una serie para borrarla.</Text>
            ) : null}

            {/* modo cámara: cuenta reps y arranca el descanso cuando parás */}
            {camOk && !finished && child?.blockId !== b.id && (camSupported(b) || cam) ? (
              <Button
                variant="ghost"
                label={cam ? 'Apagar modo cámara' : camAsking ? 'Abriendo cámara…' : 'Modo cámara'}
                onPress={toggleCam}
                disabled={camAsking}
                accessibilityHint={cam ? undefined : 'Usa la cámara para contar las reps y arrancar el descanso solo. Tiene que verse todo tu cuerpo.'}
                style={{ marginBottom: space.xs }}
              />
            ) : camOk && !finished && child?.blockId !== b.id && b.rep_unit !== 'sec' ? (
              <Text variant="small" tone="secondary" style={{ paddingVertical: space.sm }}>
                La cámara no cuenta bien este ejercicio. Mirá cuáles sí en la pestaña Cámara.
              </Text>
            ) : null}

            {/* carga: serie hija o siguiente principal */}
            {child?.blockId === b.id && lastMain ? (
              <SetEntry
                key={`child-${lastMain.id}-${childrenOf(lastMain.id).length}`}
                label={`${tech?.label.replace('+ ', '') ?? 'Extra'} ${childrenOf(lastMain.id).length + 1}`}
                defaultWeight={
                  b.technique_slug === 'drop-set' && lastMain.weight_kg
                    ? Math.round(lastMain.weight_kg * (1 - Number(parseJson<Record<string, unknown>>(b.technique_params, {}).drop_pct ?? 0.25)) / 2.5) * 2.5
                    : lastMain.weight_kg
                }
                defaultReps={Math.max(1, Math.round((lastMain.reps ?? b.reps_min) / 3))}
                defaultEffort={effMode === 'rpe' ? 10 : 0}
                mode={effMode}
                onToggleMode={() => setMode({ ...mode, [b.id]: effMode === 'rir' ? 'rpe' : 'rir' })}
                unit={b.rep_unit}
                barbell={barbell}
                onConfirm={(v) => onConfirm(b, v)}
                onCancel={() => setChild(null)}
              />
            ) : !finished ? (
              <SetEntry
                key={`${b.id}-${done.length}`}
                label={`Serie ${done.length + 1} de ${n}`}
                defaultWeight={nextTarget?.weight_kg ?? lastMain?.weight_kg ?? null}
                defaultReps={nextTarget?.reps ?? b.reps_min}
                defaultEffort={
                  s?.rir_target == null ? null : effMode === 'rpe' ? 10 - s.rir_target : s.rir_target
                }
                mode={effMode}
                onToggleMode={() => setMode({ ...mode, [b.id]: effMode === 'rir' ? 'rpe' : 'rir' })}
                unit={b.rep_unit}
                amrap={nextTarget?.amrap}
                barbell={barbell}
                cameraReps={cam && camEnded?.blockId === b.id && camEnded.idx === done.length + 1 ? camEnded.reps : null}
                cameraForm={cam && camEnded?.blockId === b.id && camEnded.idx === done.length + 1 ? camEnded.form : null}
                onConfirm={(v) => onConfirm(b, v)}
              />
            ) : null}

            {/* pendientes */}
            {s && !finished ? s.sets.slice(done.length + 1).map((t, i) => (
              <SetLine key={i} index={String(done.length + 2 + i)} weight={t.weight_kg} reps={t.reps}
                unit={b.rep_unit} state="pending" />
            )) : null}

            {tech && lastMain && child?.blockId !== b.id ? (
              <Button label={tech.label} onPress={() => setChild({ blockId: b.id, parentId: lastMain.id })}
                style={{ marginTop: space.md }} />
            ) : null}
            {b.notes ? <Text variant="small" style={{ marginTop: space.md }}>{b.notes}</Text> : null}

          </View>
        ) : null}
        <Divider />
      </View>
    );
  }

  const showCam = cam && !!currentBlock && !allDone;
  const elapsedMin = Math.max(0, Math.floor((now - Date.parse(session.started_at)) / 60000));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        <Header
          label={`${dayRows[0]?.name ?? 'Sesión'} · ${elapsedMin} min`}
          title="Entrenando"
          right={<Text variant="numberSm" tone="secondary">{blocks.length - pending.length}/{blocks.length}</Text>}
        />
        <Divider />

        {!blocksLoading && !blocksFetching && !blocks.length ? (
          <EmptyState
            title="Este día no tiene ejercicios"
            text="Agregá ejercicios al día de la rutina y volvé a empezar la sesión."
            action={session.routine_day_id ? (
              <Button label="Editar el día" onPress={() => router.push({ pathname: '/rutina/dia/[id]', params: { id: session.routine_day_id! } })} />
            ) : undefined}
          />
        ) : null}

        {showStart ? (
          <Tip text="Escribí el peso y las reps, tocá Hecho y arranca el descanso." onClose={startTip.dismiss} style={{ marginTop: space.md }} />
        ) : showSuper ? (
          <Tip text="Mantené apretado un ejercicio para juntarlo en superserie con otro." onClose={superTip.dismiss} style={{ marginTop: space.md }} />
        ) : null}

        {units.map((u) => (u.group ? (
          <View key={u.key} style={{ borderLeftWidth: 2, borderLeftColor: colors.text, paddingLeft: space.md, marginTop: space.md }}>
            <Text variant="label" style={{ paddingTop: space.md, color: colors.text }}>
              Superserie {u.group} · descanso después de {u.items.at(-1)?.exercise_name}
            </Text>
            {u.items.map(renderBlock)}
          </View>
        ) : <View key={u.key}>{u.items.map(renderBlock)}</View>))}

        <Button
          variant={allDone && !child ? 'primary' : 'ghost'}
          label="Terminar sesión"
          onPress={finish}
          loading={finishing}
          style={{ marginTop: space.xl, marginBottom: (timer.active ? 140 : 0) + (showCam ? 260 : 0) }}
        />
      </Screen>

      {showCam && currentBlock ? (
        <View style={styles.bottom}>
          <CameraDock
            exerciseName={currentBlock.exercise_name}
            enabled={camSupported(currentBlock)}
            disabledText={currentBlock.rep_unit !== 'sec' && !camSupported(currentBlock)
              ? 'La cámara no cuenta bien este ejercicio (no se ve el movimiento entero). Cargalo a mano.' : undefined}
            armed={camEnded == null}
            restActive={timer.active}
            onSetEnd={onCamSetEnd}
            formTarget={camForm}
            onRearm={() => { setCamEnded(null); camRest.current = null; }}
            onClose={() => { setCam(false); setCamEnded(null); camRest.current = null; }}
          />
          {timer.active ? (
            <RestBar inline endAt={timer.endAt} total={timer.total} onAdd={timer.add} onSkip={timer.skip} />
          ) : null}
        </View>
      ) : timer.active ? (
        <RestBar endAt={timer.endAt} total={timer.total} onAdd={timer.add} onSkip={timer.skip} />
      ) : null}
      <RecordBurst ref={burst} />
    </View>
  );
}

const styles = StyleSheet.create({
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  blockHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.lg, gap: space.sm },
});
