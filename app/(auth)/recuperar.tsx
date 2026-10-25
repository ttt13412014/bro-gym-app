import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { authErrorEs, setPasswordResetting, validCode, validEmail } from '@/lib/authFlow';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme';
import { Button, Field, Screen, Text } from '@/ui';

// 1) email → 2) código del mail + contraseña nueva. Con código (no link) no hace falta deep link.
export default function Recuperar() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [verified, setVerified] = useState(false); // el código ya se usó: solo falta guardar la contraseña
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // si se sale a mitad de camino, no dejar la app trabada
  useEffect(() => () => setPasswordResetting(false), []);

  async function send() {
    setLoading(true); setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (err) return setError(authErrorEs(err.message));
    setStep('code');
    setInfo('Si el mail tiene cuenta, te llegó un código.');
  }

  async function save() {
    setLoading(true); setError(null); setInfo(null);
    try {
      if (!verified) {
        setPasswordResetting(true); // verifyOtp inicia sesión: que no cambie de pantalla todavía
        const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
        if (err) { setPasswordResetting(false); return setError(authErrorEs(err.message)); }
        setVerified(true);
      }
      const { error: err } = await supabase.auth.updateUser({ password: pass });
      if (err) return setError(authErrorEs(err.message));
      setPasswordResetting(false); // listo: entra a la app
    } finally {
      setLoading(false);
    }
  }

  const passOk = pass.length >= 8 && pass === pass2;
  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center' }}>
        <Text variant="label">Bro?</Text>
        <Text variant="title" style={{ marginTop: space.xs, marginBottom: space.xxl }}>Recuperar contraseña</Text>

        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email"
          keyboardType="email-address" placeholder="vos@mail.com" editable={step === 'email'} />
        {step === 'code' ? (
          <>
            {!verified ? (
              <Field label="Código" mono value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ''))} keyboardType="number-pad"
                autoComplete="one-time-code" maxLength={10} placeholder="123456" />
            ) : null}
            <Field label="Contraseña nueva" value={pass} onChangeText={setPass} secureTextEntry autoComplete="new-password" placeholder="Mínimo 8 caracteres" />
            <Field label="Repetila" value={pass2} onChangeText={setPass2} secureTextEntry autoComplete="new-password" />
            {pass2 && pass !== pass2 ? <Text variant="small" style={{ marginBottom: space.md }}>No coinciden.</Text> : null}
          </>
        ) : null}

        {error ? <Text variant="small" style={{ marginBottom: space.lg }}>{error}</Text> : null}
        {info ? <Text variant="small" style={{ marginBottom: space.lg }}>{info}</Text> : null}

        {step === 'email' ? (
          <Button variant="primary" label="Mandar código" onPress={send} loading={loading} disabled={!validEmail(email)} />
        ) : (
          <Button variant="primary" label="Guardar contraseña" onPress={save} loading={loading}
            disabled={!passOk || (!verified && !validCode(code))} />
        )}
        <View style={{ height: space.md }} />
        {step === 'code' && !verified ? <Button variant="ghost" label="Reenviar código" onPress={send} /> : null}
        {!verified ? <Button variant="ghost" label="Volver" style={{ marginTop: space.sm }} onPress={() => router.back()} /> : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
