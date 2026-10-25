import '@azure/core-asynciterator-polyfill';
import {
  Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold,
} from '@expo-google-fonts/archivo';
import {
  IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import { PowerSyncContext } from '@powersync/react';
import type { Session } from '@supabase/supabase-js';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { connectSync, powersync, resetSync } from '@/db/system';
import { supabase } from '@/lib/supabase';
import { usePasswordResetting } from '@/lib/authFlow';
import { forgetUserId, rememberUserId, storedUserId } from '@/lib/userId';
import { SyncNotices, ThemeProvider, useTheme } from '@/ui';
import { AccentSync } from '@/ui/AccentSync';

SplashScreen.preventAutoHideAsync();
// recordatorios locales con la app abierta: el de fin de descanso no se muestra (ya vibra el temporizador)
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const rest = n.request.content.data?.kind === 'descanso';
    return { shouldShowBanner: !rest, shouldShowList: !rest, shouldPlaySound: false, shouldSetBadge: false };
  },
});

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  );
}

function Root() {
  const { colors, scheme, ready: themeReady } = useTheme();
  const [fontsLoaded] = useFonts({
    Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold,
    IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold,
  });
  const [session, setSession] = useState<Session | null>(null);
  const [offlineUser, setOfflineUser] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Sin señal y con el token vencido getSession() puede dar null: se usa el user_id guardado
  useEffect(() => {
    Promise.all([supabase.auth.getSession(), storedUserId()]).then(([{ data }, stored]) => {
      setSession(data.session);
      if (data.session) rememberUserId(data.session.user.id);
      setOfflineUser(stored);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s) { rememberUserId(s.user.id); setOfflineUser(s.user.id); }
      if (event === 'SIGNED_OUT') { forgetUserId(); setOfflineUser(null); resetSync(); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  const resetting = usePasswordResetting();
  // recuperando contraseña: hay sesión pero se queda en la pantalla de auth hasta guardar la nueva
  const signedIn = (!!session || !!offlineUser) && !resetting;

  // recordatorios del ciclo: al iniciar, al volver a primer plano y cuando cambian los datos (local o sync)

  useEffect(() => {
    if (session) connectSync().catch((e) => console.warn('[sync] connect', e));
  }, [session?.user.id]);

  // fondo de la ventana (se ve en transiciones y al abrir el teclado) acorde al tema
  useEffect(() => { SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {}); }, [colors.bg]);

  useEffect(() => {
    if (fontsLoaded && authReady && themeReady) SplashScreen.hideAsync();
  }, [fontsLoaded, authReady, themeReady]);

  if (!fontsLoaded || !authReady || !themeReady) return null;

  return (
    <PowerSyncContext.Provider value={powersync}>
      {signedIn ? <AccentSync /> : null}
      {/* íconos de la barra de estado: claros sobre oscuro, oscuros sobre claro */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sesion/[id]" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
          <Stack.Screen name="metodo/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ejercicio/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="camara/[id]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="comparar" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="armador" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="comida/agregar" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="comida/escanear" options={{ animation: 'fade' }} />
          <Stack.Screen name="comida/porcion" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="comida/nuevo" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="comida/perfil" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="comida/semana" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="progreso/medidas" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="progreso/maximos" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="progreso/musculos" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="rutina/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="rutina/dia/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="rutina/bloque/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="rutina/elegir" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="rutina/plan" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="ajustes" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="contrasena" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="bienvenida" options={{ animation: 'fade', gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)/login" />
          <Stack.Screen name="(auth)/recuperar" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>
      </Stack>
      <SyncNotices />
    </PowerSyncContext.Provider>
  );
}
