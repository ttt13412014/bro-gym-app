import { usePowerSync, useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { deleteBlock, resetProgression, updateBlock, validatePatch, type BlockPatch } from '@/routine/edit';
import { space } from '@/theme';
import { Button, ChipGroup, ExerciseThumb, Field, Header, Row, Screen, Section, Stepper, Text, confirmDestructive } from '@/ui';
import { fmtKg, parseJson } from '@/workout/data';
import { fmtClock } from '@/workout/useRestTimer';
import { friendlyError } from '@/ui/feedback';

type B = {
  id: string; routine_day_id: string; exercise_id: string; exercise_name: string; sets: number; reps_min: number; reps_max: number;
  rep_unit: 'reps' | 'sec'; rest_sec: number; tempo: string | null; intensity: string; technique_id: string | null;
  technique_params: string | null; group_key: string | null; progression: string | null; notes: string | null;
  routine_progression: string; exercise_images: string | null;
};
type T = { id: string; slug: string; name: string; is_public: number };
type Intensity = { type: 'rir' | 'rpe' | 'none' | 'pct_1rm' | 'pct_tm'; value?: number | null };

// Parámetros por defecto al elegir una técnica
const TECH_DEFAULTS: Record<string, unknown> = {
  'rest-pause': { mini_sets: 2, rest_sec: 15 },
  'drop-set': { drops: 2, drop_pct: 0.25 },
  'myo-reps': { activation_reps: 15, mini_reps: 4, mini_sets: 4 },
  negativas: { eccentric_sec: 4 },
  superserie: {},
  'fst7-finisher': { rest_sec: [30, 45] },
};

const PROG_LABEL: Record<string, string> = {
  double: 'Doble (reps y después peso)', linear: 'Lineal (peso cada sesión)', reps: 'Por reps (peso corporal)',
  wave_531: 'Olas 5/3/1', fixed_pct: '% fijo (GVT)', none: 'Sin progresión',
};

export default function Bloque() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = usePowerSync();
  const { data } = useQuery<B>(
    `SELECT b.*, e.name_es AS exercise_name, e.images AS exercise_images, r.progression AS routine_progression
     FROM user_routine_blocks b JOIN exercises e ON e.id = b.exercise_id
     JOIN user_routine_days d ON d.id = b.routine_day_id JOIN user_routines r ON r.id = d.routine_id
     WHERE b.id = ?`, [id],
  );
  const { data: techs } = useQuery<T>('SELECT id, slug, name, is_public FROM techniques ORDER BY name');
  const b = data[0];

  const [f, setF] = useState<{
    sets: number; reps_min: number; reps_max: number; rep_unit: 'reps' | 'sec'; rest_sec: number;
    intensity: Intensity; technique_id: string | null; group_key: string | null; progression: string | null;
    tempo: string; notes: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // carga inicial (si el bloque cambia por sync mientras se edita, no se pisa lo que está editando)
  useEffect(() => {
    if (!b || f) return;
    setF({
      sets: b.sets, reps_min: b.reps_min, reps_max: b.reps_max, rep_unit: b.rep_unit, rest_sec: b.rest_sec,
      intensity: parseJson<Intensity>(b.intensity, { type: 'none' }), technique_id: b.technique_id, group_key: b.group_key,
      progression: parseJson<{ kind: string } | null>(b.progression, null)?.kind ?? null,
      tempo: b.tempo ?? '', notes: b.notes ?? '',
    });
  }, [b?.id]);

  if (!b || !f) return <Screen><Header title="Cargando" /></Screen>;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const routineKind = parseJson<{ kind: string } | null>(b.routine_progression, null)?.kind ?? 'double';
  const pct = f.intensity.type === 'pct_1rm' || f.intensity.type === 'pct_tm';
  const tempoOk = !f.tempo.trim() || /^\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}$/.test(f.tempo.trim());
  const techSlug = techs.find((t) => t.id === f.technique_id)?.slug ?? null;
  const visibleTechs = techs.filter((t) => t.is_public || t.id === f.technique_id);
  const error = validatePatch({ sets: f.sets, reps_min: f.reps_min, reps_max: f.reps_max, rest_sec: f.rest_sec })
    ?? (!tempoOk ? 'Tempo: formato 3-1-1-0 (bajada-pausa-subida-pausa)' : null)
    ?? (techSlug === 'superserie' && !f.group_key ? 'Superserie: elegí una letra y poné la misma en el otro ejercicio' : null);

  const progOptions = [
    { value: '', label: `Del método · ${PROG_LABEL[routineKind] ?? routineKind}` },
    ...['double', 'linear', 'reps', 'none'].map((k) => ({ value: k, label: PROG_LABEL[k]! })),
    ...(f.progression && !['double', 'linear', 'reps', 'none'].includes(f.progression)
      ? [{ value: f.progression, label: PROG_LABEL[f.progression] ?? f.progression }] : []),
  ];

  async function save() {
    if (!f || error) return;
    setBusy(true);
    try {
      const prevProg = parseJson<Record<string, unknown> | null>(b!.progression, null);
      const patch: BlockPatch = {
        sets: f.sets, reps_min: f.reps_min, reps_max: f.reps_max, rep_unit: f.rep_unit, rest_sec: f.rest_sec,
        intensity: f.intensity.type === 'none' ? { type: 'none' } : f.intensity,
        technique_id: f.technique_id,
        technique_params: f.technique_id === b!.technique_id
          ? parseJson<unknown>(b!.technique_params, null)
          : (techSlug ? TECH_DEFAULTS[techSlug] ?? {} : null),
        group_key: f.group_key,
        // se conserva la config de la progresión si no cambió de tipo (ej. inc_kg de 5/3/1)
        progression: !f.progression ? null
          : prevProg?.kind === f.progression ? prevProg
          : f.progression === 'linear' ? { kind: 'linear', inc_kg: 2.5, fail_limit: 3, deload_pct: 0.1 }
          : f.progression === 'reps' ? { kind: 'reps', inc_reps: 1, next_variant_at_reps_max: true }
          : f.progression === 'none' ? { kind: 'none' }
          : { kind: 'double', inc_kg: 2.5 },
        tempo: f.tempo.trim() || null, notes: f.notes.trim() || null,
      };
      await updateBlock(db, b!.id, patch);
      router.back();
    } catch (e) {
      Alert.alert('No se guardó', friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header label="Ejercicio" title={b.exercise_name} />
      <Row label="Ver cómo se hace" hint="Fotos y pasos del ejercicio" value="→"
        left={<ExerciseThumb images={b.exercise_images} name={b.exercise_name} size={52} />}
        onPress={() => router.push({ pathname: '/ejercicio/[id]', params: { id: b.exercise_id } })} />
      <Row label="Cambiar ejercicio" hint="Reinicia la progresión de este bloque" value="→"
        onPress={() => router.push({ pathname: '/rutina/elegir', params: { blockId: b.id } })} />

      <Section label="Series y repeticiones">
        <Stepper label="Series" value={f.sets} onChange={(v) => set('sets', v)} min={1} max={20} />
        <ChipGroup value={f.rep_unit} onChange={(v) => set('rep_unit', v)}
          options={[{ value: 'reps', label: 'Reps' }, { value: 'sec', label: 'Segundos' }]} />
        <Stepper label={f.rep_unit === 'sec' ? 'Segundos mín.' : 'Reps mín.'} value={f.reps_min} min={1} max={f.rep_unit === 'sec' ? 300 : 50}
          step={f.rep_unit === 'sec' ? 5 : 1} onChange={(v) => setF({ ...f, reps_min: v, reps_max: Math.max(v, f.reps_max) })} />
        <Stepper label={f.rep_unit === 'sec' ? 'Segundos máx.' : 'Reps máx.'} value={f.reps_max} min={f.reps_min} max={f.rep_unit === 'sec' ? 300 : 50}
          step={f.rep_unit === 'sec' ? 5 : 1} onChange={(v) => set('reps_max', v)} />
        <Stepper label="Descanso" value={f.rest_sec} min={0} max={600} step={15} format={fmtClock} onChange={(v) => set('rest_sec', v)} />
      </Section>

      <Section label="Intensidad">
        {pct ? (
          <>
            <Row label={f.intensity.type === 'pct_tm' ? (f.intensity.value ? `${Math.round(f.intensity.value * 100)}% del training max` : 'Olas de 5/3/1')
              : `${Math.round((f.intensity.value ?? 0) * 100)}% del 1RM`} hint="La calcula el método con tu 1RM" />
            <Button variant="ghost" label="Pasar a RIR" onPress={() => set('intensity', { type: 'rir', value: 2 })} />
          </>
        ) : (
          <>
            <View style={{ paddingTop: space.md }}>
              <ChipGroup value={f.intensity.type} onChange={(t) => set('intensity', t === 'rir' ? { type: 'rir', value: 2 } : t === 'rpe' ? { type: 'rpe', value: 8 } : { type: 'none' })}
                options={[{ value: 'rir', label: 'RIR' }, { value: 'rpe', label: 'RPE' }, { value: 'none', label: 'Sin objetivo' }]} />
            </View>
            {f.intensity.type === 'rir' ? (
              <Stepper label="Reps en reserva" value={f.intensity.value ?? 2} min={0} max={5}
                onChange={(v) => set('intensity', { type: 'rir', value: v })} />
            ) : f.intensity.type === 'rpe' ? (
              <Stepper label="RPE" value={f.intensity.value ?? 8} min={6} max={10} step={0.5} format={(v) => fmtKg(v)}
                onChange={(v) => set('intensity', { type: 'rpe', value: v })} />
            ) : null}
          </>
        )}
      </Section>

      <Section label="Técnica">
        <View style={{ paddingTop: space.md }}>
          <ChipGroup value={f.technique_id ?? ''} onChange={(v) => setF({ ...f, technique_id: v || null, group_key: v ? f.group_key : null })}
            options={[{ value: '', label: 'Ninguna' }, ...visibleTechs.map((t) => ({ value: t.id, label: t.name }))]} />
          {techSlug === 'superserie' ? (
            <ChipGroup label="Grupo (la misma letra en los ejercicios que van juntos)" value={f.group_key ?? ''}
              onChange={(v) => set('group_key', v || null)}
              options={['A', 'B', 'C', 'D'].map((x) => ({ value: x, label: x }))} />
          ) : null}
        </View>
      </Section>

      <Section label="Progresión">
        <View style={{ paddingTop: space.md }}>
          <ChipGroup value={f.progression ?? ''} onChange={(v) => set('progression', v || null)} options={progOptions} />
        </View>
        <Row label="Reiniciar progresión" hint="La próxima sesión vuelve a estimar el peso desde tu historial"
          onPress={() => Alert.alert('Reiniciar progresión', 'La próxima sesión de este ejercicio arranca a estimar el peso de nuevo desde tu historial. Tus series quedan.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Reiniciar', onPress: () => { resetProgression(db, b.id).then(() => Alert.alert('Listo', 'Progresión reiniciada.')).catch((e) => Alert.alert('No se guardó', friendlyError(e))); } },
          ])} />
      </Section>

      <Section label="Opcional">
        <View style={{ paddingTop: space.lg }}>
          <Field label="Tempo (bajada-pausa-subida-pausa)" mono placeholder="3-1-1-0" value={f.tempo} onChangeText={(v) => set('tempo', v)} />
          <Field label="Notas" value={f.notes} onChangeText={(v) => set('notes', v)} placeholder="Agarre, altura del banco…" maxLength={200} />
        </View>
      </Section>

      {error ? <Text variant="small" style={{ marginTop: space.lg }}>{error}</Text> : null}
      <Button variant="primary" label="Guardar" onPress={save} loading={busy} disabled={!!error} style={{ marginTop: space.xl }} />
      <Button variant="ghost" label="Borrar ejercicio" style={{ marginTop: space.sm }}
        onPress={() => confirmDestructive({
          title: 'Borrar ejercicio',
          message: `Se saca «${b.exercise_name}» de este día de la rutina. Tu historial con ese ejercicio queda.`,
          onConfirm: () => deleteBlock(db, b.id).then(() => router.back()),
        })} />
    </Screen>
  );
}
