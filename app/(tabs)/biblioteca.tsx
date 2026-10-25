import { useQuery } from '@powersync/react';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { CATEGORY_ES, EQUIPMENT_ES, GOAL_ES, LEVEL_ES, MUSCLE_ES, daysLabel } from '@/catalog/labels';
import { gutter, space } from '@/theme';
import {
  Button, ChipGroup, EXERCISE_ROW_H, EmptyState, ExerciseRow, FadeIn, Field, Header, Row, Screen, Section, Segmented, Text, useEnterWindow,
} from '@/ui';
import { parseJson } from '@/workout/data';
import { CameraBadge } from '@/workout/camera';
import { isCameraSupported } from '@/workout/cameraSupport';
import { useTheme } from '@/ui';

type Tab = 'metodos' | 'ejercicios';

export default function Biblioteca() {
  const [tab, setTab] = useState<Tab>('metodos');
  return tab === 'metodos' ? <Metodos tab={tab} setTab={setTab} /> : <Ejercicios tab={tab} setTab={setTab} />;
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <Segmented<Tab>
      value={tab}
      onChange={setTab}
      options={[{ value: 'metodos', label: 'Métodos' }, { value: 'ejercicios', label: 'Ejercicios' }]}
    />
  );
}

// ----------------------------------------------------------------- métodos
type M = {
  id: string; name: string; creator: string | null; level: string; category: string; goals: string;
  days_min: number; days_max: number;
};

function Metodos({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { data, isLoading: methodsLoading } = useQuery<M>(
    `SELECT id, name, creator, level, category, goals, days_min, days_max FROM methods
     WHERE is_published = 1 ORDER BY name`,
  );
  const [goal, setGoal] = useState('todos');
  const [level, setLevel] = useState('todos');
  const [days, setDays] = useState(0);
  const [compare, setCompare] = useState<string[] | null>(null);

  const filtered = data.filter((m) => {
    const goals = parseJson<string[]>(m.goals, []);
    return (goal === 'todos' || goals.includes(goal))
      && (level === 'todos' || m.level === level)
      && (days === 0 || (days >= m.days_min && days <= m.days_max));
  });

  // Mapa por objetivo principal (primer objetivo del método)
  const groups = useMemo(() => {
    const g = new Map<string, M[]>();
    for (const m of filtered) {
      const key = parseJson<string[]>(m.goals, [])[0] ?? 'otros';
      g.set(key, [...(g.get(key) ?? []), m]);
    }
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function toggle(id: string) {
    if (!compare) return router.push({ pathname: '/metodo/[id]', params: { id } });
    setCompare(compare.includes(id) ? compare.filter((x) => x !== id) : [...compare, id].slice(-2));
  }

  return (
    <Screen>
      <Header label="Biblioteca" title="Métodos" />
      <Tabs tab={tab} setTab={setTab} />

      <Row label="Armar mi rutina" hint="6 preguntas y te elijo el método" value="→" onPress={() => router.push('/armador')} />

      <View style={{ marginTop: space.xl }}>
        <ChipGroup label="Objetivo" scroll value={goal} onChange={setGoal}
          options={[{ value: 'todos', label: 'Todos' }, ...Object.entries(GOAL_ES).map(([value, label]) => ({ value, label }))]} />
        <ChipGroup label="Nivel" scroll value={level} onChange={setLevel}
          options={[{ value: 'todos', label: 'Todos' }, ...Object.entries(LEVEL_ES).map(([value, label]) => ({ value, label }))]} />
        <ChipGroup label="Días por semana" mono scroll value={days} onChange={setDays}
          options={[{ value: 0, label: '—' }, ...[2, 3, 4, 5, 6].map((d) => ({ value: d, label: String(d) }))]} />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
        <Text variant="label" style={{ flexShrink: 1 }}>{filtered.length} métodos</Text>
        <Button variant="ghost" label={compare ? 'Cancelar' : 'Comparar'} onPress={() => setCompare(compare ? null : [])}
          style={{ height: 40, paddingHorizontal: 0 }} />
      </View>
      {compare ? <Text variant="small">Elegí 2 métodos.</Text> : null}

      {!groups.length && !methodsLoading ? (
        <EmptyState title="Ningún método con esos filtros" text="Probá poniendo «Todos» en objetivo o nivel, o cambiá los días." />
      ) : null}

      {groups.map(([g, ms]) => (
        <Section key={g} label={GOAL_ES[g] ?? g} count={ms.length}>
          {ms.map((m) => (
            <Row
              key={m.id}
              label={compare ? `${compare.includes(m.id) ? '●' : '○'}  ${m.name}` : m.name}
              hint={[LEVEL_ES[m.level], CATEGORY_ES[m.category], m.creator].filter(Boolean).join(' · ')}
              value={daysLabel(m.days_min, m.days_max)}
              onPress={() => toggle(m.id)}
            />
          ))}
        </Section>
      ))}

      {compare?.length === 2 ? (
        <Button variant="primary" label="Comparar" style={{ marginTop: space.xl }}
          onPress={() => { router.push({ pathname: '/comparar', params: { a: compare[0], b: compare[1] } }); setCompare(null); }} />
      ) : null}
    </Screen>
  );
}

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id); }, [v, ms]);
  return d;
}

// ----------------------------------------------------------------- ejercicios
type E = {
  id: string; name: string | null; name_es: string; equipment: string | null; primary_muscles: string; images: string | null;
  category: string | null; force: string | null;
};

const LIMIT = 2000; // el catálogo entero (877 hoy) se puede recorrer; la lista virtualizada lo banca
const openExercise = (id: string) => router.push({ pathname: '/ejercicio/[id]', params: { id } });
const exerciseHint = (e: E) => [
  parseJson<string[]>(e.primary_muscles, []).map((m) => MUSCLE_ES[m] ?? m).join(', '),
  e.equipment ? EQUIPMENT_ES[e.equipment] ?? e.equipment : null,
].filter(Boolean).join(' · ');

const CAM_BADGE = <CameraBadge />;

const MUSCLE_FILTERS = ['chest', 'lats', 'middle back', 'shoulders', 'biceps', 'triceps', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'abdominals'];
const EQUIP_FILTERS = ['barbell', 'dumbbell', 'cable', 'machine', 'body only'];

function Ejercicios({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equip, setEquip] = useState('');
  // la consulta sigue al texto con 200 ms de espera: no re-arma la búsqueda en cada letra
  const qSearch = useDebounced(q.trim(), 200);
  const like = `%${qSearch}%`;
  const { data, isLoading } = useQuery<E>(
    `SELECT id, name, name_es, equipment, primary_muscles, images, category, force FROM exercises
     WHERE deleted_at IS NULL
       AND (name_es LIKE ? OR name LIKE ?)
       AND (? = '' OR primary_muscles LIKE ?)
       AND (? = '' OR equipment = ?)
     ORDER BY name_es LIMIT ${LIMIT}`,
    [like, like, muscle, `%"${muscle}"%`, equip, equip],
  );

  const header = (
    <View>
      <Header label="Biblioteca" title="Ejercicios" />
      <Tabs tab={tab} setTab={setTab} />
      <Field label="Buscar" value={q} onChangeText={setQ} placeholder="Sentadilla, curl, remo…" autoCorrect={false} />
      <ChipGroup label="Músculo" scroll value={muscle} onChange={(v) => setMuscle(v === muscle ? '' : v)}
        options={MUSCLE_FILTERS.map((m) => ({ value: m, label: MUSCLE_ES[m] ?? m }))} />
      <ChipGroup label="Equipo" scroll value={equip} onChange={(v) => setEquip(v === equip ? '' : v)}
        options={EQUIP_FILTERS.map((e) => ({ value: e, label: EQUIPMENT_ES[e] ?? e }))} />
      <Text variant="label" style={{ marginBottom: space.sm }}>{data.length >= LIMIT ? `${LIMIT}+` : data.length} ejercicios</Text>
    </View>
  );

  // los primeros ítems entran escalonados solo al abrir la pantalla
  const entering = useEnterWindow();
  // alto fijo por fila: la lista salta directo a cualquier parte sin medir (el encabezado se mide una vez)
  const headerH = useRef(0);
  const getItemLayout = useCallback((_: ArrayLike<E> | null | undefined, index: number) => (
    { length: EXERCISE_ROW_H, offset: headerH.current + EXERCISE_ROW_H * index, index }
  ), []);
  const renderItem = useCallback(({ item, index }: { item: E; index: number }) => (
    <FadeIn index={index} animate={entering()} distance={8} duration={200}>
      <ExerciseRow id={item.id} name={item.name_es} hint={exerciseHint(item)} images={item.images} onPress={openExercise}
        value={isCameraSupported(item) ? CAM_BADGE : undefined} />
    </FadeIn>
  ), []);

  return (
    <Screen scroll={false}>
      <FlatList
        data={data}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={<View onLayout={(e) => { headerH.current = e.nativeEvent.layout.height; }}>{header}</View>}
        ListEmptyComponent={isLoading ? undefined : <EmptyState title="No encontré ejercicios" text="Probá con otra palabra o sacá el filtro de músculo o equipo." />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={40}
        windowSize={9}
        removeClippedSubviews
        getItemLayout={getItemLayout}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: space.xxxl }}
        style={{ marginHorizontal: -gutter, paddingHorizontal: gutter, backgroundColor: colors.bg }}
      />
    </Screen>
  );
}
