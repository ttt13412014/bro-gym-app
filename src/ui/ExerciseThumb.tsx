import { memo, useState, type ReactNode } from 'react';
import { Image, Pressable, View } from 'react-native';
import { line, radius, space } from '@/theme';
import { Text } from './Text';
import { makeStyles } from './ThemeProvider';
import { EXERCISE_IMG_BASE } from './ExerciseImage';
import { dimWhenPressed, useRipple } from './motion';
import { useTapGuard } from './useTapGuard';

// Miniatura cuadrada de un ejercicio (primera foto). Sin foto o si falla la carga: la inicial del nombre.
// `images` acepta el JSON tal cual viene de SQLite o el arreglo ya parseado.
function firstImage(images: string | string[] | null | undefined): string | null {
  if (!images) return null;
  if (Array.isArray(images)) return images[0] ?? null;
  try {
    const v = JSON.parse(images) as unknown;
    return Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null;
  } catch { return null; }
}

export const ExerciseThumb = memo(function ExerciseThumb({
  images, name, size = 52,
}: { images: string | string[] | null | undefined; name?: string | null; size?: number }) {
  const styles = useStyles();
  const src = firstImage(images);
  const [failed, setFailed] = useState<string | null>(null);
  const box = { width: size, height: size };
  if (!src || failed === src) {
    const initial = (name ?? '').trim().charAt(0).toUpperCase() || '·';
    return (
      <View style={[styles.box, styles.empty, box]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text variant="numberSm" tone="disabled">{initial}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.box, box]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image
        source={{ uri: EXERCISE_IMG_BASE + src }}
        style={box}
        resizeMode="cover"
        fadeDuration={120}
        onError={() => setFailed(src)}
      />
    </View>
  );
});

const useStyles = makeStyles((colors) => ({
  box: { overflow: 'hidden', borderRadius: radius.md, borderWidth: line, borderColor: colors.line, backgroundColor: colors.surface },
  empty: { alignItems: 'center', justifyContent: 'center' },
  rowWrap: { height: EXERCISE_ROW_H },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  divider: { height: line, backgroundColor: colors.line },
}));

// ----------------------------------------------------------------- fila de lista de ejercicio (alto fijo)
// Alto fijo (EXERCISE_ROW_H, divisor incluido) para getItemLayout en listas largas: nombre y detalle en una línea.
export const EXERCISE_ROW_H = 77;
export const ExerciseRow = memo(function ExerciseRow({
  id, name, hint, images, value, onPress,
}: {
  id: string; name: string; hint?: string; images: string | string[] | null | undefined;
  value?: ReactNode; onPress?: (id: string) => unknown;
}) {
  const styles = useStyles();
  const ripple = useRipple();
  const { run } = useTapGuard(onPress ? () => onPress(id) : null);
  return (
    <View style={styles.rowWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hint ? `${name}. ${hint}` : name}
        disabled={!onPress}
        onPress={() => run()}
        android_ripple={ripple}
        style={({ pressed }) => [styles.row, dimWhenPressed(pressed)]}
      >
        <ExerciseThumb images={images} name={name} size={52} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="body" numberOfLines={1}>{name}</Text>
          {hint ? <Text variant="small" numberOfLines={1}>{hint}</Text> : null}
        </View>
        {typeof value === 'string' || typeof value === 'number'
          ? <Text variant="numberSm" numberOfLines={1} style={{ flexShrink: 1, maxWidth: '40%', textAlign: 'right' }}>{value}</Text>
          : value ? <View style={{ flexShrink: 1, maxWidth: '45%', alignItems: 'flex-end' }}>{value}</View> : null}
      </Pressable>
      <View style={styles.divider} />
    </View>
  );
});
