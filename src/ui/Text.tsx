import { Text as RNText, type TextProps } from 'react-native';
import { type as typeScale, typeTone, type TypeVariant } from '@/theme';
import { useTheme } from './ThemeProvider';

type Props = TextProps & {
  variant?: TypeVariant;
  tone?: 'default' | 'secondary' | 'disabled' | 'accent';
};

export function Text({ variant = 'body', tone = 'default', style, ...rest }: Props) {
  const { colors } = useTheme();
  const color = tone === 'secondary' ? colors.textSecondary
    : tone === 'disabled' ? colors.textDisabled
    : tone === 'accent' ? colors.accent
    : colors[typeTone[variant]];
  return <RNText {...rest} style={[typeScale[variant], { color }, style]} />;
}
