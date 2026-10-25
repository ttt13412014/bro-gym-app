import { useQuery } from '@powersync/react';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '@/theme';
import {
  Button, EmptyState, ExerciseThumb, Header, Screen, Section, Stepper, Text, confirmDestructive, haptic, useTheme,
} from '@/ui';
import { CameraDock, askCameraPermission, cameraModeAvailable } from '@/workout/camera';
import { isCameraSupported } from '@/workout/cameraSupport';
import { FormNote, RestBar } from '@/workout/components';
import { formTarget, type FormSummary } from '@/workout/formCheck';
import { fmtClock, useRestTimer } from '@/workout/useRestTimer';

// Sesión libre con la cámara: cuenta reps por serie y arranca un descanso simple.
// No guarda nada en el historial (para eso está la sesión de la rutina).
type E = {
  id: string; name: string | null; name_es: string; category: string | null; equipment: string | null;
  force: string | null; images: string | null;
};

export default function CamaraLibre() {
  useKeepAwake();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useQuery<E>(
    'SELECT id, name, name_es, category, equipment, force, images FROM exercises WHERE id = ?', [id],
  );
  const ex = data[0];
  const available = useMemo(() => cameraModeAvailable(), []);
  const supported = ex ? isCameraSupported(ex) : true;
  const form = useMemo(() => (ex ? formTarget(ex) : null), [ex?.id, ex?.name, ex?.name_es]);

  const [cam, setCam] = useState(false);
  const [asking, setAsking] = useState(false);
  const [sets, setSets] = useState<{ reps: number; form: FormSummary | null }[]>([]);
  const [armed, setArmed] = useState(true);
  const [restSec, setRestSec] = useState(90);
  const timer = useRestTimer();
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  async function turnOn() {
    if (asking) return;
    setAsking(true);
    try {
      if (await askCameraPermission()) { if (alive.current) { haptic.success(); setArmed(true); setCam(true); } }
    } finally { if (alive.current) setAsking(false); }
  }

  // al entrar, prende la cámara (pide el permiso explicando para qué)
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !available || !ex) return;
    tried.current = true;
    turnOn();
  }, [available, ex]);

  // terminó el descanso (o lo salteaste): vuelve a contar la próxima serie
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !timer.active && !armed) setArmed(true);
    wasActive.current = timer.active;
  }, [timer.active]);

  function onSetEnd(reps: number, f: FormSummary | null) {
    setSets((s) => [...s, { reps, form: f }]);
    setArmed(false);
    timer.start(restSec);
  }

  const total = sets.reduce((a, b) => a + b.reps, 0);
  const name = ex?.name_es ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        <Header label="Cámara · sesión libre" title={name || 'Ejercicio'}
          right={<Button variant="ghost" label="Cerrar" onPress={() => router.back()} style={{ height: 40, paddingHorizontal: 0 }} />} />

        {!ex && !isLoading ? (
          <EmptyState title="No encontré este ejercicio" text="Volvé a la pestaña Cámara y elegí otro." />
        ) : null}

        {ex ? (
          <View style={styles.top}>
            <ExerciseThumb images={ex.images} name={name} size={64} />
            <Text variant="small" style={{ flex: 1, minWidth: 0 }}>
              {supported
                ? 'Teléfono a 2–3 m, todo el cuerpo en cuadro. Arrancá cuando quieras: cuento cada rep y, cuando parás unos segundos, cierro la serie y arranco el descanso.'
                : 'Ojo: este ejercicio no está entre los que la cámara cuenta bien. Puede contar de menos o de más.'}
            </Text>
          </View>
        ) : null}

        {!available ? (
          <EmptyState title="Sin modo cámara en este teléfono" text="No encontré una cámara disponible." />
        ) : !cam && ex ? (
          <Button variant="primary" label={asking ? 'Abriendo cámara…' : 'Prender cámara'} onPress={turnOn} disabled={asking}
            style={{ marginBottom: space.lg }} />
        ) : null}

        <Section label="Descanso">
          <Stepper label="Entre series" value={restSec} onChange={setRestSec} min={15} max={600} step={15} format={fmtClock} />
        </Section>

        <Section label="Series contadas" count={sets.length || undefined}>
          {sets.length ? (
            <>
              {sets.map((r, i) => (
                <View key={i}>
                  <Stepper label={`Serie ${i + 1}`} value={r.reps} min={0} max={200}
                    onChange={(v) => setSets((s) => s.map((x, j) => (j === i ? { ...x, reps: v } : x)))} format={(v) => `${v} reps`} />
                  {r.form ? <FormNote summary={r.form} style={{ marginTop: 0, marginBottom: space.sm }} /> : null}
                </View>
              ))}
              <Text variant="small" style={{ paddingTop: space.md }}>
                Total: {total} reps en {sets.length} {sets.length === 1 ? 'serie' : 'series'}. Si contó mal, corregilo con − y +.
              </Text>
              <Button variant="ghost" label="Empezar de cero"
                onPress={() => confirmDestructive({
                  title: 'Empezar de cero', message: 'Se borran las series contadas en esta pantalla.', confirmLabel: 'Borrar',
                  onConfirm: () => { setSets([]); timer.skip(); setArmed(true); },
                })}
                style={{ marginTop: space.sm }} />
            </>
          ) : (
            <Text variant="small" style={{ paddingVertical: space.md }}>
              Todavía no contaste ninguna serie. Arrancá cuando la cámara diga «Listo».
            </Text>
          )}
          <Text variant="small" tone="disabled" style={{ paddingTop: space.sm }}>
            Esto no se guarda en tu historial. Para registrar, usá la sesión de tu rutina con «Modo cámara».
          </Text>
        </Section>

        <View style={{ height: (timer.active ? 140 : 0) + (cam ? 280 : 0) }} />
      </Screen>

      {cam && ex ? (
        <View style={styles.bottom}>
          <CameraDock
            exerciseName={name}
            enabled
            armed={armed}
            restActive={timer.active}
            onSetEnd={onSetEnd}
            formTarget={form}
            onRearm={() => { timer.skip(); setArmed(true); }}
            onClose={() => setCam(false)}
            stoppedHint="Serie anotada abajo. Descansá: cuando termine el descanso vuelvo a contar."
            rearmLabel="Contar la próxima serie ya"
          />
          {timer.active ? <RestBar inline endAt={timer.endAt} total={timer.total} onAdd={timer.add} onSkip={timer.skip} /> : null}
        </View>
      ) : timer.active ? (
        <RestBar endAt={timer.endAt} total={timer.total} onAdd={timer.add} onSkip={timer.skip} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
