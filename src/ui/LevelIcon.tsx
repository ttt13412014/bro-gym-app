import Svg, { Circle, G, Path } from 'react-native-svg';
import { useTheme } from './ThemeProvider';

// Íconos de nivel: línea de 1.5 px (viewBox 24 = tamaño 24), sin relleno.
// Gris para bajo y medio; acento solo para el alto (strength_levels.uses_accent).
export type LevelIconName = 'fideo' | 'estrella' | 'mandibula';

type Props = { icon: LevelIconName; accent?: boolean; size?: number };

export function LevelIcon({ icon, accent = false, size = 24 }: Props) {
  const { colors } = useTheme();
  const stroke = accent ? colors.accent : colors.textSecondary;
  const common = {
    stroke, strokeWidth: size >= 96 ? 1.1 : (1.5 * 24) / size, fill: 'none', // grande: trazo más grueso
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityRole="image">
      {icon === 'fideo' && (
        <>
          {/* dos tiras flojas que se caen y se enroscan abajo */}
          <Path {...common} d="M3.6 4.2c1.5 0 2.1 1.2 2.8 2.7.6 1.3 1.4 2 2.7 2.4 1.5.5 2.6 1.3 3.4 2.7.7 1.2 1.6 1.7 2.2 2.6.8 1.1.7 2.7-.6 3.4-.9.5-2.1.4-3.2.6-1.4.3-2.4 1-2.3 2 .1.8 1.1 1.2 2.6 1" />
          <G transform="translate(2.6 0)">
            <Path {...common} d="M3.6 4.2c1.5 0 2.1 1.2 2.8 2.7.6 1.3 1.4 2 2.7 2.4 1.5.5 2.6 1.3 3.4 2.7.7 1.2 1.6 1.7 2.2 2.6.8 1.1.7 2.7-.6 3.4-.9.5-1.6.5-2.3.6" />
          </G>
          {/* cara triste */}
          <Circle {...common} cx="17.6" cy="4.6" r="1" />
          <Circle {...common} cx="20.6" cy="4.6" r="1" />
          <Path {...common} d="M17.4 7.6c.9-.6 2.3-.6 3.2 0" />
        </>
      )}
      {icon === 'estrella' && (
        <>
          {/* estrella de cinco puntas */}
          <Path {...common} d="M12.0 3.6 L14.2 9.6 L20.6 9.8 L15.5 13.7 L17.3 19.9 L12.0 16.3 L6.7 19.9 L8.5 13.7 L3.4 9.8 L9.8 9.6Z" />
        </>
      )}
      {icon === 'mandibula' && (
        <>
          {/* cabeza con mandíbula cuadrada y cuello */}
          <Path {...common} d="M7 2.9C10.4 1.9 13.8 1.9 17.2 2.9L18 7V11.5L17.2 15.3L16.5 17L13.8 20.2H10.3L6.8 17L6 12V7Z" />
          <Path {...common} d="M10.1 20.2V22M13.9 20.2V22" />
          {/* cejas-ojos, nariz, boca */}
          <Path {...common} d="M8.5 8.4H11M12.9 8.4H15.5" />
          <Path {...common} d="M12 9.6V13.5L11 14.1" />
          <Path {...common} d="M9.6 16.4H14.5" />
        </>
      )}
    </Svg>
  );
}
