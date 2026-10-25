// Tema claro / oscuro. Preferencia guardada en el teléfono (no se sincroniza). Oscuro por defecto.
// Acento: se guarda en user_settings (se sincroniza) y una copia acá para arrancar sin parpadeo.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { DEFAULT_ACCENT, isHex, paletteFor, type Palette, type Scheme } from '@/theme';

export type ThemeMode = 'dark' | 'light' | 'system';
const KEY = 'judiogym.theme';
const ACCENT_KEY = 'judiogym.accent';

type Ctx = {
  colors: Palette; scheme: Scheme; mode: ThemeMode; setMode: (m: ThemeMode) => void; ready: boolean;
  accent: string; setAccent: (hex: string | null) => void;
};
const ThemeCtx = createContext<Ctx>({
  colors: paletteFor('dark'), scheme: 'dark', mode: 'dark', setMode: () => {}, ready: true,
  accent: DEFAULT_ACCENT, setAccent: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme(); // necesita "userInterfaceStyle": "automatic" en app.json
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [accent, setAccentState] = useState(DEFAULT_ACCENT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([KEY, ACCENT_KEY])
      .then((pairs) => {
        const v = pairs[0]?.[1];
        const a = pairs[1]?.[1];
        if (v === 'dark' || v === 'light' || v === 'system') setModeState(v);
        if (isHex(a)) setAccentState(a.toUpperCase());
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setAccent = useCallback((hex: string | null) => {
    const a = isHex(hex) ? hex.toUpperCase() : DEFAULT_ACCENT;
    setAccentState((prev) => (prev === a ? prev : a));
    AsyncStorage.setItem(ACCENT_KEY, a).catch(() => {});
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(KEY, m).catch(() => {});
  }, []);

  const scheme: Scheme = mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;
  const value = useMemo(
    () => ({ colors: paletteFor(scheme, accent), scheme, mode, setMode, ready, accent, setAccent }),
    [scheme, mode, setMode, ready, accent, setAccent],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);

// Fuerza una paleta en un pedazo de pantalla (ej. la cámara: siempre oscuro)
export function ThemeScope({ scheme, children }: { scheme: Scheme; children: ReactNode }) {
  const parent = useContext(ThemeCtx);
  const value = useMemo(() => ({ ...parent, colors: paletteFor(scheme, parent.accent), scheme }), [parent, scheme]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

// RN 0.88 ya no exporta StyleSheet.NamedStyles: equivalente local (da tipado contextual a 'row', 'center', etc.)
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

// Estilos que dependen de la paleta: se arman una vez por tema
export function makeStyles<T extends NamedStyles<T>>(build: (c: Palette) => T) {
  const cache = new Map<Palette, T>();
  return function useStyles(): T {
    const { colors } = useTheme();
    let s = cache.get(colors);
    if (!s) { s = StyleSheet.create(build(colors)); cache.set(colors, s); }
    return s;
  };
}
