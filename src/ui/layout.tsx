import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { gutter, line, space } from '@/theme';
import { haptic } from './feedback';
import { HelpDot, type HelpTerm } from './Help';
import { Text } from './Text';
import { makeStyles } from './ThemeProvider';
import { useTapGuard } from './useTapGuard';
import { EASE_OUT, dimWhenPressed, reduceMotion, useRipple } from './motion';

// Android achica la ventana con el teclado (adjustResize); en iOS se empuja con padding.
// El scroll deja tocar botones con el teclado abierto y lo cierra al arrastrar.
// Al montar, el contenido aparece y sube 10 px (220 ms). Una sola vez: volver a una pestaña ya abierta
// o una consulta nueva no la repite.
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const styles = useStyles();
  const enter = useEnter();
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={enter}>{children}</Animated.View>
          </ScrollView>
        ) : (
          <Animated.View style={[styles.content, { flex: 1 }, enter]}>{children}</Animated.View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useEnter() {
  const skip = useRef(reduceMotion()).current;
  const v = useRef(new Animated.Value(skip ? 1 : 0)).current;
  useEffect(() => {
    if (skip) return;
    const a = Animated.timing(v, { toValue: 1, duration: 220, easing: EASE_OUT, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, []);
  const style = useRef(skip ? null : {
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  }).current;
  return style;
}

// Estado vacío: qué pasa y qué hacer (con un botón opcional)
export function EmptyState({
  title, text, action,
}: { title: string; text?: string; action?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <Text variant="bodyStrong">{title}</Text>
      {text ? <Text variant="small" style={{ marginTop: space.xs }}>{text}</Text> : null}
      {action ? <View style={{ marginTop: space.lg }}>{action}</View> : null}
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  const styles = useStyles();
  return <View style={[styles.divider, style]} />;
}

// Encabezado de pantalla: etiqueta chica + título
export function Header({ label, title, right }: { label?: string; title: string; right?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
        {label ? <Text variant="label">{label}</Text> : null}
        <Text variant="title" style={{ marginTop: label ? space.xs : 0 }}>{title}</Text>
      </View>
      {right ? <View style={{ flexShrink: 0, maxWidth: '45%', marginLeft: space.md, alignItems: 'flex-end' }}>{right}</View> : null}
    </View>
  );
}

// Fila de lista: etiqueta a la izquierda, valor (número) a la derecha, divisor abajo
// Tocable: se marca al apretar y no abre dos veces la misma pantalla con doble toque
export function Row({
  label, value, hint, onPress, onLongPress, disabled, left,
}: {
  label: string; value?: ReactNode; hint?: string; onPress?: () => unknown; onLongPress?: () => void; disabled?: boolean;
  left?: ReactNode; // p. ej. la miniatura del ejercicio
}) {
  const styles = useStyles();
  const { run } = useTapGuard(onPress);
  const touchable = !!(onPress || onLongPress);
  const ripple = useRipple();
  // valor largo (p. ej. "Fuerza, Hipertrofia, Resistencia"): va abajo del título para no aplastarlo.
  // Los números con unidad (p. ej. "102,5 × 10 · RPE 8,5") siguen en mono también abajo.
  const isText = typeof value === 'string' || typeof value === 'number';
  const str = isText ? String(value) : '';
  const longValue = isText && str.length > 16;
  const numeric = isText && /^[\s+\-−–~≈]*\d/.test(str);
  const tone = disabled ? 'disabled' : 'default';
  const inner = (
    <>
      {left}
      <View style={{ flex: 1, flexShrink: 1, minWidth: 96 }}>
        <Text variant="body" tone={tone}>{label}</Text>
        {hint ? <Text variant="small">{hint}</Text> : null}
        {longValue ? (
          <Text variant={numeric ? 'numberSm' : 'bodyStrong'} tone={tone} style={{ marginTop: 2 }}>{str}</Text>
        ) : null}
      </View>
      {longValue || value == null || value === false || value === '' ? null : isText ? (
        <Text variant="numberSm" tone={tone} numberOfLines={2} ellipsizeMode="tail"
          style={{ flexShrink: 1, maxWidth: '55%', textAlign: 'right', marginLeft: 12 }}>{str}</Text>
      ) : (
        // nodos propios (chip, botón, switch, texto): con techo de ancho para que nunca aplasten la etiqueta
        <View style={{ flexShrink: 1, maxWidth: '55%', alignItems: 'flex-end' }}>{value}</View>
      )}
    </>
  );
  if (touchable) {
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hint ? `${label}. ${hint}` : label}
          accessibilityState={{ disabled: !!disabled }}
          disabled={disabled}
          onPress={onPress ? () => run() : undefined}
          onLongPress={onLongPress ? () => { haptic.tap(); onLongPress(); } : undefined}
          delayLongPress={450}
          android_ripple={ripple}
          style={({ pressed }) => [styles.row, styles.touch, dimWhenPressed(pressed)]}
        >
          {inner}
        </Pressable>
        <Divider />
      </View>
    );
  }
  return (
    <View>
      <View style={styles.row}>
        {inner}
      </View>
      <Divider />
    </View>
  );
}

// help: muestra un "?" al lado del título que explica el término en una línea
export function Section({ label, children, highlight = true, count, help }: { label: string; children: ReactNode; highlight?: boolean; count?: number; help?: HelpTerm }) {
  const styles = useStyles();
  if (highlight) {
    // título de sección resaltado: franja con barra de acento a la izquierda
    return (
      <View style={styles.section}>
        <View style={styles.band}>
          <View style={styles.bar} />
          <Text variant="body" style={[styles.bandText, { flexShrink: 1, paddingVertical: space.xs }]}>{label.toUpperCase()}</Text>
          {help ? <HelpDot term={help} style={{ marginLeft: space.sm }} /> : null}
          {count != null ? <Text variant="small" style={{ marginLeft: 'auto', flexShrink: 0 }}>{count}</Text> : null}
        </View>
        {children}
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
        <Text variant="label" style={{ flexShrink: 1 }}>{label}</Text>
        {help ? <HelpDot term={help} /> : null}
      </View>
      <Divider />
      {children}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: gutter, paddingBottom: space.xxxl },
  divider: { height: line, backgroundColor: colors.line },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: space.xl, paddingBottom: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.lg, gap: space.md },
  section: { marginTop: space.xl },
  band: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44, paddingRight: space.md,
    backgroundColor: colors.surface, borderWidth: line, borderColor: colors.line, borderRadius: 6, overflow: 'hidden',
    marginBottom: space.xs,
  },
  bar: { width: 4, alignSelf: 'stretch', backgroundColor: colors.accent },
  bandText: { color: colors.text, fontWeight: '700', letterSpacing: 1.2 },
  touch: { minHeight: 48 },
  empty: { paddingVertical: space.xl },
}));
