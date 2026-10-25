import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { fonts } from '@/theme';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

// Gráficos mínimos con react-native-svg: líneas claras sobre grilla gris, sin acento ni degradés.

const fmtDefault = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
const shortDate = (t: number) => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

function useWidth() {
  const [w, setW] = useState(0);
  return { w, onLayout: (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width)) };
}

export function LineChart({
  data, dots = [], band, goal, segmentColor, height = 160, format = fmtDefault, empty = 'Sin datos todavía',
}: {
  data: { t: number; v: number }[];
  dots?: { t: number; v: number }[];   // valores sueltos (gris) detrás de la línea, ej. pesajes diarios
  band?: { min: number | null; max: number | null }; // rango de referencia: dos líneas punteadas
  goal?: number | null;                // meta: línea punteada con su valor
  segmentColor?: (from: number, to: number) => string | null; // color de cada tramo (ej. verde hacia la meta)
  height?: number; format?: (v: number) => string; empty?: string;
}) {
  const { colors } = useTheme();
  const { w, onLayout } = useWidth();
  if (data.length < 2) {
    return <View style={{ height: 48, justifyContent: 'center' }}><Text variant="small">{empty}</Text></View>;
  }
  const padL = 44, padR = 8, padT = 8, padB = 20;
  const xs = [...data, ...dots].map((d) => d.t);
  const ys = [...data, ...dots].map((d) => d.v).concat([band?.min, band?.max, goal].filter((v): v is number => v != null));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.1; y0 -= pad; y1 += pad;
  const iw = Math.max(1, w - padL - padR), ih = height - padT - padB;
  const X = (t: number) => padL + ((t - x0) / Math.max(1, x1 - x0)) * iw;
  const Y = (v: number) => padT + (1 - (v - y0) / (y1 - y0)) * ih;
  const d = data.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ');
  const grid = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y1 - (y1 - y0) * 0.15];
  const last = data[data.length - 1]!;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          {grid.map((g, i) => (
            <Line key={i} x1={padL} x2={w - padR} y1={Y(g)} y2={Y(g)} stroke={colors.line} strokeWidth={1} />
          ))}
          {grid.map((g, i) => (
            <SvgText key={`l${i}`} x={padL - 6} y={Y(g) + 4} fontSize={10} fill={colors.textDisabled}
              fontFamily={fonts.monoRegular} textAnchor="end">{format(g)}</SvgText>
          ))}
          {[band?.min, band?.max].map((b, i) => (b == null ? null : (
            <Line key={`b${i}`} x1={padL} x2={w - padR} y1={Y(b)} y2={Y(b)} stroke={colors.textDisabled} strokeWidth={1} strokeDasharray="4 4" />
          )))}
          {dots.map((p, i) => <Circle key={`d${i}`} cx={X(p.t)} cy={Y(p.v)} r={2} fill={colors.textDisabled} />)}
          {goal != null ? (
            <>
              <Line x1={padL} x2={w - padR} y1={Y(goal)} y2={Y(goal)} stroke={colors.textSecondary} strokeWidth={1} strokeDasharray="6 4" />
              <SvgText x={w - padR} y={Y(goal) - 4} fontSize={10} fill={colors.textSecondary} fontFamily={fonts.mono} textAnchor="end">
                {`meta ${format(goal)}`}
              </SvgText>
            </>
          ) : null}
          {segmentColor ? data.slice(1).map((p, i) => {
            const a = data[i]!;
            return (
              <Line key={`s${i}`} x1={X(a.t)} y1={Y(a.v)} x2={X(p.t)} y2={Y(p.v)}
                stroke={segmentColor(a.v, p.v) ?? colors.text} strokeWidth={2} strokeLinecap="round" />
            );
          }) : (
            <Path d={d} stroke={colors.text} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          )}
          <Circle cx={X(last.t)} cy={Y(last.v)} r={3} fill={colors.text} />
          <SvgText x={padL} y={height - 4} fontSize={10} fill={colors.textDisabled} fontFamily={fonts.monoRegular}>
            {shortDate(x0)}
          </SvgText>
          <SvgText x={w - padR} y={height - 4} fontSize={10} fill={colors.textDisabled} fontFamily={fonts.monoRegular} textAnchor="end">
            {shortDate(x1)}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

export function BarChart({
  data, height = 140, format = fmtDefault,
}: { data: { label: string; v: number }[]; height?: number; format?: (v: number) => string }) {
  const { colors } = useTheme();
  const { w, onLayout } = useWidth();
  if (!data.length) return <View style={{ height: 48, justifyContent: 'center' }}><Text variant="small">Sin datos todavía</Text></View>;
  const padT = 16, padB = 18;
  const max = Math.max(1, ...data.map((d) => d.v));
  const slot = w / data.length;
  const bw = Math.max(4, slot * 0.56);
  const ih = height - padT - padB;
  return (
    <View onLayout={onLayout} style={{ height }}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Line x1={0} x2={w} y1={padT + ih} y2={padT + ih} stroke={colors.line} strokeWidth={1} />
          {data.map((d, i) => {
            const h = (d.v / max) * ih;
            const x = i * slot + (slot - bw) / 2;
            const isLast = i === data.length - 1;
            return (
              <Rect key={i} x={x} y={padT + ih - h} width={bw} height={Math.max(h, d.v > 0 ? 1 : 0)}
                fill={isLast ? colors.text : colors.textDisabled} />
            );
          })}
          {data.map((d, i) => (
            <SvgText key={`t${i}`} x={i * slot + slot / 2} y={height - 4} fontSize={9} fill={colors.textDisabled}
              fontFamily={fonts.monoRegular} textAnchor="middle">{d.label}</SvgText>
          ))}
          {/* valor solo sobre la última barra */}
          {data.length ? (
            <SvgText x={(data.length - 1) * slot + slot / 2} y={padT + ih - ((data[data.length - 1]!.v / max) * ih) - 4}
              fontSize={10} fill={colors.text} fontFamily={fonts.mono} textAnchor="middle">
              {format(data[data.length - 1]!.v)}
            </SvgText>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}
