// Silueta de frente y de espalda con cada grupo muscular pintado según su volumen.
// Formas simples (sin degradés): elipses y polígonos en un viewBox de 120 × 250.
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { fonts } from '@/theme';
import { useTheme } from './ThemeProvider';

type Shape =
  | { k: 'e'; cx: number; cy: number; rx: number; ry: number }
  | { k: 'p'; d: string }
  | { k: 'r'; x: number; y: number; w: number; h: number; rx?: number };

const E = (cx: number, cy: number, rx: number, ry: number): Shape => ({ k: 'e', cx, cy, rx, ry });
const P = (d: string): Shape => ({ k: 'p', d });
const R = (x: number, y: number, w: number, h: number, rx = 3): Shape => ({ k: 'r', x, y, w, h, rx });
const pair = (cx: number, cy: number, rx: number, ry: number) => [E(cx, cy, rx, ry), E(120 - cx, cy, rx, ry)];

const NEUTRAL: Shape[] = [
  R(54, 27, 12, 9, 2), ...pair(23, 128, 4.5, 4.5), ...pair(49, 181, 6, 4), ...pair(47, 238, 7, 4),
];

export const FRONT: Record<string, Shape[]> = {
  traps: [P('M54 34 L44 41 L54 41 Z'), P('M66 34 L76 41 L66 41 Z')],
  shoulders: pair(37, 48, 10, 9),
  chest: [P('M47 42 L59 42 L59 64 Q50 68 42 62 Q40 50 47 42 Z'), P('M73 42 L61 42 L61 64 Q70 68 78 62 Q80 50 73 42 Z')],
  biceps: pair(31, 72, 6, 13),
  forearms: pair(26, 103, 5.5, 16),
  abdominals: [R(51, 67, 18, 45, 4), P('M44 68 L49.5 68 L49.5 108 L45 103 Z'), P('M76 68 L70.5 68 L70.5 108 L75 103 Z')],
  quadriceps: pair(50, 152, 9.5, 24),
  calves: pair(48, 208, 6, 21),
};

export const BACK: Record<string, Shape[]> = {
  traps: [P('M60 30 L76 41 L66 46 L60 62 L54 46 L44 41 Z')],
  shoulders: pair(37, 48, 10, 9),
  lats: [P('M45 50 L53 50 L53 92 L48 88 Q43 70 45 50 Z'), P('M75 50 L67 50 L67 92 L72 88 Q77 70 75 50 Z')],
  'middle back': [P('M54.5 48 L60 64 L65.5 48 L65.5 92 L54.5 92 Z')],
  'lower back': [R(50, 94, 20, 18, 3)],
  triceps: pair(31, 72, 6, 13),
  forearms: pair(26, 103, 5.5, 16),
  glutes: pair(51, 126, 9.5, 11),
  hamstrings: pair(50, 158, 9, 19),
  calves: pair(48, 208, 7.5, 21),
};

function draw(s: Shape, key: string, props: Record<string, unknown>) {
  if (s.k === 'e') return <Ellipse key={key} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...props} />;
  if (s.k === 'r') return <Rect key={key} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} {...props} />;
  return <Path key={key} d={s.d} {...props} />;
}

export function BodyMap({
  fill, selected, onSelect,
}: {
  fill: (muscle: string) => { color: string; empty: boolean };
  selected?: string | null;
  onSelect?: (muscle: string) => void;
}) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const each = Math.max(0, (w - 16) / 2);
  const h = Math.round((each * 268) / 120);

  const figure = (shapes: Record<string, Shape[]>, label: string) => (
    <Svg width={each} height={h} viewBox="0 0 120 268">
      <Circle cx={60} cy={16} r={11} fill={colors.surface} stroke={colors.line} strokeWidth={1} />
      {NEUTRAL.map((s, i) => draw(s, `n${i}`, { fill: colors.surface, stroke: colors.line, strokeWidth: 1 }))}
      <P0 />
      {Object.entries(shapes).map(([m, list]) => {
        const f = fill(m);
        const on = selected === m;
        return (
          <G key={m} onPress={onSelect ? () => onSelect(m) : undefined}>
            {list.map((s, i) => draw(s, `${m}${i}`, {
              fill: f.color,
              stroke: on ? colors.text : f.empty ? colors.textDisabled : colors.line,
              strokeWidth: on ? 1.8 : 1,
              strokeDasharray: f.empty && !on ? '2.5 2' : undefined,
            }))}
          </G>
        );
      })}
      <SvgText x={60} y={262} fontSize={9} fill={colors.textSecondary} fontFamily={fonts.bodySemi} textAnchor="middle" letterSpacing={1.2}>
        {label}
      </SvgText>
    </Svg>
  );

  return (
    <View onLayout={onLayout} style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 120 }}>
      {w > 0 ? <>{figure(FRONT, 'FRENTE')}{figure(BACK, 'ESPALDA')}</> : null}
    </View>
  );
}

// pelvis (neutral) separada para que quede detrás de cuádriceps y glúteos
function P0() {
  const { colors } = useTheme();
  return <Path d="M44 113 L76 113 L72 130 L60 135 L48 130 Z" fill={colors.surface} stroke={colors.line} strokeWidth={1} />;
}

// Todos los músculos dibujados (los del catálogo)
export const MAP_MUSCLES = Array.from(new Set([...Object.keys(FRONT), ...Object.keys(BACK)]));
