import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { authErrorEs } from '@/lib/authFlow';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme';
import { Button, Field, Header, Screen, Text } from '@/ui';

// Cambiar contraseña con sesión iniciada: pide la actual para confirmar que sos vos
export default function Contrasena() {
  const [cur, setCur] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user.email;
      if (!email) return setError('Necesitás señal para cambiar la contraseña.');
      const check = await supabase.auth.signInWithPassword({ email, password: cur });
      if (check.error) return setError(/invalid login/i.test(check.error.message) ? 'La contraseña actual no es correcta.' : authErrorEs(check.error.message));
      const { error: err } = await supabase.auth.updateUser({ password: pass });
      if (err) return setError(authErrorEs(err.message));
      Alert.alert('Listo', 'Contraseña cambiada.');
      router.back();
    } finally {
      setBusy(false);
    }
  }

  const ok = cur.length > 0 && pass.length >= 8 && pass === pass2 && pass !== cur;
  return (
    <Screen>
      <Header label="Cuenta" title="Cambiar contraseña" />
      <Field label="Contraseña actual" value={cur} onChangeText={setCur} secureTextEntry autoComplete="current-password" />
      <Field label="Nueva" value={pass} onChangeText={setPass} secureTextEntry autoComplete="new-password" placeholder="Mínimo 8 caracteres" />
      <Field label="Repetila" value={pass2} onChangeText={setPass2} secureTextEntry autoComplete="new-password" />
      {pass2 && pass !== pass2 ? <Text variant="small" style={{ marginBottom: space.md }}>No coinciden.</Text> : null}
      {pass && pass === cur ? <Text variant="small" style={{ marginBottom: space.md }}>Tiene que ser distinta de la actual.</Text> : null}
      {error ? <Text variant="small" style={{ marginBottom: space.md }}>{error}</Text> : null}
      <Button variant="primary" label="Guardar" onPress={save} loading={busy} disabled={!ok} />
    </Screen>
  );
}
