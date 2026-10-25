// Bro? · theme
// Reglas:
//  1. Un solo uso del acento por pantalla (acción principal o serie en curso).
//  2. Estructura con líneas y aire: divisores de 1 px, radio máx. 4, sin sombras ni degradés.
//  3. Los números mandan: grandes en mono; etiquetas chicas en mayúsculas grises.
import type { TextStyle } from 'react-native';

// Dos paletas con los mismos tokens. El acento es el mismo en las dos.
// Los colores se leen con useTheme() (src/ui/ThemeProvider): nunca importar una paleta fija en una pantalla.
const dark = {
  bg: '#0A0A0A',
  surface: '#141414',
  line: '#262626',
  text: '#EDEDED',
  textSecondary: '#8A8A8A',
  textDisabled: '#5A5A5A',
  accent: '#FF4F1A',
  onAccent: '#0A0A0A',
  good: '#34D47E',   // cambio hacia la meta
  bad: '#FF5A5A',    // cambio en contra
};

const light: Palette = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  line: '#E5E5E5',
  text: '#111111',
  textSecondary: '#6B6B6B', // 5,2:1 sobre #FAFAFA
  textDisabled: '#A3A3A3',
  accent: '#FF4F1A',
  onAccent: '#0A0A0A',      // texto oscuro sobre el naranja: mismo contraste en los dos temas
  good: '#15803D',
  bad: '#DC2626',
};

export type Palette = typeof dark;
export type Scheme = 'dark' | 'light';
export const palettes: Record<Scheme, Palette> = { dark, light };

// Acentos a elección (Ajustes). El naranja es el de siempre.
export const DEFAULT_ACCENT = '#FF4F1A';
export const ACCENTS: { hex: string; name: string }[] = [
  { hex: '#FF4F1A', name: 'Naranja' },
  { hex: '#FF3355', name: 'Rojo' },
  { hex: '#FF4FA3', name: 'Rosa' },
  { hex: '#A066FF', name: 'Violeta' },
  { hex: '#3D7BFF', name: 'Azul' },
  { hex: '#14C8E0', name: 'Celeste' },
  { hex: '#2BD07A', name: 'Verde' },
  { hex: '#FFC21A', name: 'Amarillo' },
];
export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v);

// Texto sobre el acento: oscuro o blanco, el que más contraste tenga
function onAccentFor(hex: string) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#0A0A0A' : '#FFFFFF';
}

// Una paleta por (tema, acento), siempre el mismo objeto: makeStyles cachea por paleta
const built = new Map<string, Palette>();
export function paletteFor(scheme: Scheme, accent: string = DEFAULT_ACCENT): Palette {
  const a = isHex(accent) ? accent.toUpperCase() : DEFAULT_ACCENT;
  if (a === DEFAULT_ACCENT) return palettes[scheme];
  const key = `${scheme}${a}`;
  let p = built.get(key);
  if (!p) { p = { ...palettes[scheme], accent: a, onAccent: onAccentFor(a) }; built.set(key, p); }
  return p;
}

export const fonts = {
  display: 'Archivo_800ExtraBold',
  title: 'Archivo_700Bold',
  heading: 'Archivo_600SemiBold',
  body: 'IBMPlexSans_400Regular',
  bodyMedium: 'IBMPlexSans_500Medium',
  bodySemi: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
  monoRegular: 'IBMPlexMono_400Regular',
  monoSemi: 'IBMPlexMono_600SemiBold',
} as const;

// Base 4
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { none: 0, sm: 2, md: 4 } as const;
export const line = 1;
export const gutter = space.lg;

export const type = {
  // Números
  hero: { fontFamily: fonts.monoSemi, fontSize: 64, lineHeight: 68, letterSpacing: -2 },
  number: { fontFamily: fonts.mono, fontSize: 32, lineHeight: 36, letterSpacing: -0.8 },
  numberSm: { fontFamily: fonts.mono, fontSize: 17, lineHeight: 22 },
  // Texto
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.8 },
  heading: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  label: {
    fontFamily: fonts.bodySemi, fontSize: 11, lineHeight: 14, letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  button: {
    fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 18, letterSpacing: 1,
    textTransform: 'uppercase',
  },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

// Color por defecto de cada variante (token de la paleta)
export const typeTone: Record<TypeVariant, 'text' | 'textSecondary'> = {
  hero: 'text', number: 'text', numberSm: 'text', title: 'text', heading: 'text', body: 'text', bodyStrong: 'text',
  small: 'textSecondary', label: 'textSecondary', button: 'text',
};

