import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { fonts, line, space } from '@/theme';
import { sanitizeNumeric } from './feedback';
import { Text } from './Text';
import { makeStyles, useTheme } from './ThemeProvider';

// Campo sin caja: etiqueta arriba y una línea abajo que se aclara con el foco.
// Con teclado numérico (decimal-pad / number-pad) solo deja escribir números: acepta "," y "." y nunca el signo menos.
// `error` muestra debajo qué está mal (y marca la línea).
export function Field({
  label, mono, style, onFocus, onBlur, onChangeText, error, keyboardType, ...rest
}: TextInputProps & { label: string; mono?: boolean; error?: string | null }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [focus, setFocus] = useState(false);
  const numeric = keyboardType === 'decimal-pad' || keyboardType === 'number-pad' || keyboardType === 'numeric';
  const decimal = keyboardType !== 'number-pad';
  return (
    <View style={styles.wrap}>
      <Text variant="label" style={error ? { color: colors.text } : null}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textDisabled}
        selectionColor={colors.text}
        accessibilityLabel={label}
        keyboardType={keyboardType}
        {...(numeric ? { inputMode: decimal ? 'decimal' : 'numeric', autoCorrect: false } as const : null)}
        {...rest}
        onChangeText={onChangeText ? (t) => onChangeText(numeric ? sanitizeNumeric(t, decimal) : t) : undefined}
        onFocus={(e) => { setFocus(true); onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); onBlur?.(e); }}
        style={[
          styles.input,
          {
            fontFamily: mono ? fonts.mono : fonts.body,
            borderBottomColor: error || focus ? colors.text : colors.line,
          },
          style,
        ]}
      />
      {error ? <Text variant="small" style={{ color: colors.text, marginTop: space.xs }}>{error}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { marginBottom: space.xl },
  input: {
    color: colors.text,
    fontSize: 17,
    minHeight: 48,
    paddingVertical: space.md,
    borderBottomWidth: line,
  },
}));
