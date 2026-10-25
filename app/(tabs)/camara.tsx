import { useQuery } from '@powersync/react';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { EQUIPMENT_ES, MUSCLE_ES } from '@/catalog/labels';
import { gutter, space } from '@/theme';
import {
  ChipGroup, EXERCISE_ROW_H, EmptyState, ExerciseRow, FadeIn, Field, Header, Screen, Section, Text, useEnterWindow, useTheme,
} from '@/ui';
import { CameraBadge, cameraModeAvailable } from '@/workout/camera';
import { CAMERA_UNSUPPORTED_NOTE, isCameraSupported } from '@/workout/cameraSupport';
import { parseJson } from '@/workout/data';

// Pestaña Cámara: qué ejercicios cuenta el modo cámara y una sesión libre para probarlo.
type E = {
  id: string; name: string | null; name_es: string; equipment: string | null; primary_muscles: string; images: string | null;
  category: string | null; force: string | null;
};
type Show = 'si' | 'no';

const hintOf = (e: E) => [
  parseJson<string[]>(e.primary_muscles, []).map((m) => MUSCLE_ES[m] ?? m).join(', '),
  e.equipment ? EQUIPMENT_ES[e.equipment] ?? e.equipment : null,
].filter(Boolean).join(' · ');

const openFree = (id: string) => router.push({ pathname: '/camara/[id]', params: { id } });
const openSheet = (id: string) => router.push({ pathname: '/ejercicio/[id]', params: { id } });
const BADGE = <CameraBadge />;

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id); }, [v, ms]);
  return d;
}

export default function Camara() {
  const { colors } = useTheme();
  const available = useMemo(() => cameraModeAvailable(), []);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('si');
  const qSearch = useDebounced(q.trim(), 200);
  const like = `%${qSearch}%`;
  const { data, isLoading } = useQuery<E>(
    `SELECT id, name, name_es, equipment, primary_muscles, images, category, force FROM exercises
     WHERE deleted_at IS NULL AND (name_es LIKE ? OR name LIKE ?)
     ORDER BY name_es LIMIT 2000`,
    [like, like],
  );
  const { yes, no } = useMemo(() => {
    const yes: E[] = [], no: E[] = [];
    for (const e of data) (isCameraSupported(e) ? yes : no).push(e);
    return { yes, no };
  }, [data]);
  const list = show === 'si' ? yes : no;

  const header = (
    <View>
      <Header label="Modo cámara" title="Cámara" />
      {!available ? (
        <EmptyState title="Este teléfono no puede usar el modo cámara"
          text="No encontré una cámara disponible. Igual podés ver qué ejercicios cuenta." />
      ) : null}
      <Section label="Cómo se usa">
        <View style={{ gap: space.xs, paddingBottom: space.md }}>
          <Text variant="small" style={{ color: colors.text }}>1. Apoyá el teléfono parado a 2–3 m, a la altura de la cintura.</Text>
          <Text variant="small" style={{ color: colors.text }}>2. Que se vea todo tu cuerpo, de la cabeza a los pies.</Text>
          <Text variant="small" style={{ color: colors.text }}>3. Flexiones y dominadas: ponete de costado a la cámara.</Text>
          <Text variant="small" style={{ color: colors.text }}>4. Elegí un ejercicio, arrancá y cuando parás unos segundos se corta la serie y arranca el descanso.</Text>
          <Text variant="small" style={{ color: colors.text }}>5. Después de cada rep te digo «Bien» o qué corregir (se puede apagar con «Correcciones»).</Text>
          <Text variant="small" style={{ marginTop: space.xs }}>Las correcciones son aproximadas: te ayudan, pero no reemplazan a un profe.</Text>
          <Text variant="small">Todo se procesa en el teléfono: no se guardan fotos ni videos.</Text>
        </View>
      </Section>
      <Field label="Buscar" value={q} onChangeText={setQ} placeholder="Sentadilla, curl, dominadas…" autoCorrect={false} />
      <ChipGroup<Show> label="Mostrar" value={show} onChange={setShow}
        options={[{ value: 'si', label: `Cuenta bien · ${yes.length}` }, { value: 'no', label: `No compatible · ${no.length}` }]} />
      <Text variant="small" style={{ marginBottom: space.md }}>
        {show === 'si' ? 'Tocá un ejercicio para abrir la cámara y contar series sueltas.' : `${CAMERA_UNSUPPORTED_NOTE} Tocá uno para ver su ficha.`}
      </Text>
      <Text variant="label" style={{ marginBottom: space.sm }}>{list.length} ejercicios</Text>
    </View>
  );

  const entering = useEnterWindow();
  const headerH = useRef(0);
  const getItemLayout = useCallback((_: ArrayLike<E> | null | undefined, index: number) => (
    { length: EXERCISE_ROW_H, offset: headerH.current + EXERCISE_ROW_H * index, index }
  ), []);
  const renderItem = useCallback(({ item, index }: { item: E; index: number }) => {
    const ok = show === 'si';
    return (
      <FadeIn index={index} animate={entering()} distance={8} duration={200}>
        <ExerciseRow id={item.id} name={item.name_es} hint={hintOf(item)} images={item.images}
          value={ok ? BADGE : undefined} onPress={ok && available ? openFree : openSheet} />
      </FadeIn>
    );
  }, [show, available]);

  return (
    <Screen scroll={false}>
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        extraData={show}
        ListHeaderComponent={<View onLayout={(e) => { headerH.current = e.nativeEvent.layout.height; }}>{header}</View>}
        ListEmptyComponent={isLoading ? undefined : (
          <EmptyState title="No encontré ejercicios"
            text={show === 'si' ? 'Probá con otra palabra o mirá en «No compatible».' : 'Probá con otra palabra.'} />
        )}
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
