// Calendario del año estilo GitHub: una columna por semana (lunes arriba), un cuadrado por día.
import { type ReactElement, useRef } from 'react';
import { Pressable, ScrollView, type GestureResponderEvent, type ScrollViewInstance, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { mondayOf } from '@/lib/nutrition';
import { addDays } from '@/progress/stats';
import { fonts, space } from '@/theme';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

const CELL = 12, GAP = 3, TOP = 14;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function YearHeatmap({
  level, today, weeks = 53, selected, onSelect,
}: {
  level: (iso: string) => number; // 0..4
  today: string; weeks?: number; selected?: string | null; onSelect?: (iso: string) => void;
}) {
  const { colors } = useTheme();
  const scroll = useRef<ScrollViewInstance>(null);
  const start = addDays(mondayOf(new Date(`${today}T12:00:00`)), -7 * (weeks - 1));
  const shade = ['', '4D', '80', 'BF', 'FF'];
  const W = weeks * (CELL + GAP), H = TOP + 7 * (CELL + GAP);

  const cells: ReactElement[] = [];
  const labels: ReactElement[] = [];
  let lastMonth = -1;
  let lastLabelCol = -9;
  for (let c = 0; c < weeks; c++) {
    const monday = addDays(start, c * 7);
    const m = new Date(`${monday}T12:00:00`).getMonth();
    // el nombre del mes ocupa ~3 columnas: si el anterior quedó muy cerca, se saltea (no se pisan)
    if (m !== lastMonth && c < weeks - 1) {
      if (c - lastLabelCol >= 3) {
        labels.push(<SvgText key={`m${c}`} x={c * (CELL + GAP)} y={10} fontSize={9} fill={colors.textDisabled} fontFamily={fonts.monoRegular}>{MONTHS[m]}</SvgText>);
        lastLabelCol = c;
      }
      lastMonth = m;
    }
    for (let r = 0; r < 7; r++) {
      const iso = addDays(monday, r);
      if (iso > today) continue;
      const l = level(iso);
      const on = iso === selected;
      cells.push(
        <Rect key={iso} x={c * (CELL + GAP)} y={TOP + r * (CELL + GAP)} width={CELL} height={CELL} rx={2}
          fill={l ? `${colors.text}${shade[l]}` : colors.surface}
          stroke={on ? colors.accent : iso === today ? colors.textSecondary : colors.line} strokeWidth={on ? 2 : 1} />,
      );
    }
  }

  function pick(e: GestureResponderEvent) {
    const { locationX, locationY } = e.nativeEvent;
    const c = Math.floor(locationX / (CELL + GAP));
    const r = Math.floor((locationY - TOP) / (CELL + GAP));
    if (c < 0 || c >= weeks || r < 0 || r > 6) return;
    const iso = addDays(start, c * 7 + r);
    if (iso <= today) onSelect?.(iso);
  }

  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 18, paddingTop: TOP }}>
          {['L', '', 'M', '', 'V', '', 'D'].map((d, i) => (
            <Text key={i} variant="small" maxFontSizeMultiplier={1.2} style={{ height: CELL + GAP, fontSize: 9, lineHeight: CELL + GAP }}>{d}</Text>
          ))}
        </View>
        <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          {/* un solo toque para toda la grilla (no 371 cuadraditos de 12 px tocables): se calcula el día por posición */}
          <Pressable onPress={onSelect ? pick : undefined} disabled={!onSelect}>
            <Svg width={W} height={H} pointerEvents="none">{labels}{cells}</Svg>
          </Pressable>
        </ScrollView>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: space.sm, justifyContent: 'flex-end' }}>
        <Text variant="small" style={{ marginRight: 4 }}>Menos</Text>
        {[0, 1, 2, 3, 4].map((l) => (
          <View key={l} style={{ width: CELL, height: CELL, borderRadius: 2, borderWidth: 1, borderColor: colors.line, backgroundColor: l ? `${colors.text}${shade[l]}` : colors.surface }} />
        ))}
        <Text variant="small" style={{ marginLeft: 4 }}>Más</Text>
      </View>
    </View>
  );
}

