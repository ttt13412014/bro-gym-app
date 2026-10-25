import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { authErrorEs, validCode, validEmail } from '@/lib/authFlow';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme';
import { Button, Field, Screen, Text } from '@/ui';

type Mode = 'login' | 'signup' | 'confirm';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const go = (m: Mode) => { setMode(m); setError(null); setInfo(null); };

  async function submit() {
    setLoading(true); setError(null); setInfo(null);
    const creds = { email: email.trim(), password };
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword(creds);
        if (err) {
          if (/email not confirmed/i.test(err.message)) { go('confirm'); setInfo('Falta confirmar el email. Cargá el código del mail.'); return; }
          setError(authErrorEs(err.message));
        }
      } else if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp(creds);
        if (err) return setError(authErrorEs(err.message));
        // Supabase no avisa si el mail ya existe (devuelve un usuario sin identidades)
        if (data.user && data.user.identities?.length === 0) return setError('Ese email ya tiene cuenta. Entrá o recuperá la contraseña.');
        if (!data.session) { go('confirm'); setInfo('Te mandamos un código al mail.'); }
      } else {
        const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
        if (err) setError(authErrorEs(err.message));
      }
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    const { error: err } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    if (err) setError(authErrorEs(err.message)); else setInfo('Código reenviado.');
  }

  const valid = mode === 'confirm' ? validEmail(email) && validCode(code) : validEmail(email) && password.length >= 8;
  const title = mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Confirmar email';

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center' }}>
        <Text variant="label">Bro?</Text>
        <Text variant="title" style={{ marginTop: space.xs, marginBottom: space.xxl }}>{title}</Text>

        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none"
          autoComplete="email" keyboardType="email-address" placeholder="vos@mail.com" editable={mode !== 'confirm'} />
        {mode === 'confirm' ? (
          <Field label="Código" mono value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ''))} keyboardType="number-pad"
            autoComplete="one-time-code" maxLength={10} placeholder="123456" />
        ) : (
          <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Mínimo 8 caracteres" />
        )}

        {error ? <Text variant="small" style={{ marginBottom: space.lg }}>{error}</Text> : null}
        {info ? <Text variant="small" style={{ marginBottom: space.lg }}>{info}</Text> : null}

        <Button variant="primary" label={mode === 'confirm' ? 'Confirmar' : title} onPress={submit} loading={loading} disabled={!valid} />
        <View style={{ height: space.md }} />
        {mode === 'login' ? (
          <>
            <Button variant="ghost" label="No tengo cuenta" onPress={() => go('signup')} />
            <Button variant="ghost" label="Me olvidé la contraseña" style={{ marginTop: space.sm }}
              onPress={() => router.push({ pathname: '/(auth)/recuperar', params: { email: email.trim() } })} />
          </>
        ) : mode === 'signup' ? (
          <Button variant="ghost" label="Ya tengo cuenta" onPress={() => go('login')} />
        ) : (
          <>
            <Button variant="ghost" label="Reenviar código" onPress={resend} />
            <Button variant="ghost" label="Volver" style={{ marginTop: space.sm }} onPress={() => go('login')} />
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
