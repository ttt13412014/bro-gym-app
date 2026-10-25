import { usePowerSync, useQuery } from '@powersync/react';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { setSettings } from '@/lib/settings';
import { ACCENTS, line, radius, space } from '@/theme';
import { Button, ChipGroup, Header, Row, Screen, Section, Stepper, Text, haptic, useTheme, type ThemeMode } from '@/ui';
import { fmtKg } from '@/workout/data';
import { friendlyError } from '@/ui/feedback';

type S = { increment_kg: number | null; increment_db_kg: number | null };

export default function Ajustes() {
  const db = usePowerSync();
  const { mode, setMode, accent, setAccent, colors } = useTheme();
  const { data } = useQuery<S>('SELECT increment_kg, increment_db_kg FROM user_settings LIMIT 1');
  const s = data[0];
  const inc = s?.increment_kg ?? 2.5;
  const incDb = s?.increment_db_kg ?? 2;

  const setInc = (key: 'increment_kg' | 'increment_db_kg', v: number) =>
    setSettings(db, { [key]: v }).catch((e) => Alert.alert('No se guardó', friendlyError(e)));

  // color de acento: se ve al instante y se guarda en la cuenta (llega a los otros teléfonos)
  function pickAccent(hex: string) {
    if (hex === accent) return;
    haptic.select();
    setAccent(hex);
    setSettings(db, { accent_color: hex }).catch((e) => Alert.alert('No se guardó el color', friendlyError(e)));
  }

  async function doSignOut() {
    await supabase.auth.signOut();
  }
  function signOut() {
    Alert.alert('Cerrar sesión', 'Vas a tener que volver a entrar con tu mail y contraseña (y con señal). Lo que no se sincronizó todavía podría perderse.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => { doSignOut().catch((e) => Alert.alert('No se pudo cerrar la sesión', friendlyError(e))); } },
    ]);
  }

  return (
    <Screen>
      <Header label="Cuenta" title="Ajustes" />
      <Section label="Pantalla">
        <View style={{ paddingTop: space.md }}>
          <ChipGroup<ThemeMode> label="Tema" value={mode} onChange={setMode}
            options={[{ value: 'dark', label: 'Oscuro' }, { value: 'light', label: 'Claro' }, { value: 'system', label: 'Sistema' }]} />
        </View>
        <Text variant="small" style={{ marginTop: -space.sm }}>Se guarda en este teléfono.</Text>

        <Text variant="label" style={{ marginTop: space.xl, marginBottom: space.sm }}>Color</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          {ACCENTS.map((a) => {
            const on = a.hex === accent;
            return (
              <Pressable key={a.hex} onPress={() => pickAccent(a.hex)} hitSlop={4}
                accessibilityRole="radio" accessibilityLabel={a.name} accessibilityState={{ selected: on }}
                style={({ pressed }) => [{
                  width: 52, height: 52, borderRadius: radius.md, borderWidth: on ? 2 : line,
                  borderColor: on ? colors.text : colors.line, padding: 4, opacity: pressed ? 0.7 : 1,
                }]}>
                <View style={{ flex: 1, borderRadius: radius.sm, backgroundColor: a.hex, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.onAccent }} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text variant="small" style={{ marginTop: space.sm }}>
          {ACCENTS.find((a) => a.hex === accent)?.name ?? 'Naranja'} · botón principal y barras de sección. Se guarda en tu cuenta.
        </Text>
      </Section>

      <Section label="Cargas">
        <Stepper label="Salto mínimo con barra" value={inc} min={0.5} max={10} step={0.25} format={(v) => `${fmtKg(v)} kg`}
          onChange={(v) => setInc('increment_kg', v)} />
        <Stepper label="Salto mínimo con mancuernas" value={incDb} min={0.5} max={10} step={0.25} format={(v) => `${fmtKg(v)} kg`}
          onChange={(v) => setInc('increment_db_kg', v)} />
        <Text variant="small" style={{ paddingTop: space.sm }}>La progresión redondea a estos saltos.</Text>
      </Section>

      <Section label="Sesión">
        <Row label="Cambiar contraseña" value="→" onPress={() => router.push('/contrasena')} />
        <Button label="Cerrar sesión" onPress={signOut} style={{ marginTop: space.md }} />
      </Section>

      <View style={{ paddingVertical: space.xl, alignItems: 'center' }}>
        <Text variant="small">Bro? {Constants.expoConfig?.version ?? ''}</Text>
      </View>
    </Screen>
  );
}
