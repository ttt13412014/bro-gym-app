import { usePowerSync, useQuery } from '@powersync/react';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { setSettings } from '@/lib/settings';
import { space } from '@/theme';
import { Button, Field, Header, Row, Screen, Section, Text } from '@/ui';
import { nowIso } from '@/workout/data';
import { friendlyError } from '@/ui/feedback';

// Primer arranque: tres pasos que se pueden hacer en cualquier orden o dejar para después.
// Cada paso usa la pantalla de siempre; acá solo se ve qué falta.
export default function Bienvenida() {
  const db = usePowerSync();
  const { data: st } = useQuery<{ display_name: string | null }>('SELECT display_name FROM user_settings LIMIT 1');
  const { data: prof } = useQuery<{ n: number }>('SELECT count(*) AS n FROM nutrition_profiles');
  const { data: rout } = useQuery<{ name: string }>(
    'SELECT name FROM user_routines WHERE is_active = 1 AND deleted_at IS NULL LIMIT 1',
  );
  const { data: w } = useQuery<{ n: number }>('SELECT count(*) AS n FROM body_measurements WHERE weight_kg IS NOT NULL AND deleted_at IS NULL');

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (st[0]?.display_name) setName(st[0].display_name); }, [st[0]?.display_name]);

  const hasProfile = (prof[0]?.n ?? 0) > 0 && (w[0]?.n ?? 0) > 0;
  const routine = rout[0]?.name ?? null;

  async function saveName() {
    const v = name.trim();
    if (v && v !== st[0]?.display_name) await setSettings(db, { display_name: v }).catch(() => {});
  }

  async function finish() {
    setBusy(true);
    try {
      await saveName();
      await setSettings(db, { onboarded_at: nowIso() });
      router.replace('/');
    } catch (e) {
      Alert.alert('No se guardó', friendlyError(e));
    } finally { setBusy(false); }
  }

  return (
    <Screen>
      <Header label="Bro?" title="Arrancamos" />
      <Text variant="small" style={{ marginTop: -space.md, marginBottom: space.lg }}>
        Tres cosas y listo. Todo se puede cambiar después.
      </Text>

      <Field label="Cómo te llamamos" value={name} onChangeText={setName} maxLength={40} onBlur={saveName} onSubmitEditing={saveName} />

      <Section label="Pasos">
        <Row label="Tus datos" hint="Sexo, edad, altura, peso y objetivo: calorías y nivel de fuerza"
          value={hasProfile ? 'Listo' : '→'} onPress={() => router.push('/comida/perfil')} />
        <Row label="Tu rutina" hint={routine ? `Activa: ${routine}` : 'Días, tiempo, equipo y lesiones: la armamos con vos'}
          value={routine ? 'Listo' : '→'} onPress={() => router.push({ pathname: '/armador', params: { from: 'bienvenida' } })} />
        <Row label="Tus máximos (opcional)" hint="Si sabés tu 1RM, las cargas arrancan más justas"
          value="→" onPress={() => router.push('/progreso/maximos')} />
      </Section>

      <Button variant="primary" label={routine ? 'Empezar' : 'Empezar sin rutina'} onPress={finish} loading={busy}
        style={{ marginTop: space.xl }} />
      {!routine ? (
        <Text variant="small" style={{ marginTop: space.md }}>La rutina la podés armar después desde Entrenar o elegir un método en Biblioteca.</Text>
      ) : null}
    </Screen>
  );
}
