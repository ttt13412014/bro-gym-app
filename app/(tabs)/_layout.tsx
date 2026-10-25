import { useQuery, useStatus } from '@powersync/react';
import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { fonts, line } from '@/theme';
import { useTheme } from '@/ui';

// Tabs solo texto: sin íconos, sin acento. Activa = texto claro, inactiva = gris.
// La bienvenida se ofrece una vez por arranque, solo si ya bajó el primer sync
// (si no, un usuario viejo en un teléfono nuevo la vería antes de que lleguen sus datos)
let offeredThisRun = false;

export default function TabsLayout() {
  const { colors } = useTheme();
  const status = useStatus();
  const { data, isLoading } = useQuery<{ onboarded_at: string | null }>('SELECT onboarded_at FROM user_settings LIMIT 1');
  if (!offeredThisRun && status.hasSynced && !isLoading && !data[0]?.onboarded_at) {
    offeredThisRun = true;
    return <Redirect href="/bienvenida" />;
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
          borderTopWidth: line,
          elevation: 0,
        },
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textDisabled,
        tabBarLabelStyle: {
          fontFamily: fonts.bodySemi,
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        },
        tabBarItemStyle: { justifyContent: 'center' },
        // con letra grande del sistema la etiqueta se achica para entrar en una línea (no corta «BIBLIOTE…»)
        tabBarLabel: ({ color, children }) => (
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.6}
            style={{ color, fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', paddingHorizontal: 2 }}>
            {children}
          </Text>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Entrenar' }} />
      <Tabs.Screen name="biblioteca" options={{ title: 'Biblioteca' }} />
      <Tabs.Screen name="camara" options={{ title: 'Cámara' }} />
      <Tabs.Screen name="comida" options={{ title: 'Comida' }} />
      <Tabs.Screen name="progreso" options={{ title: 'Progreso' }} />
    </Tabs>
  );
}
