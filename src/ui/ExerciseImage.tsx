import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { line, radius } from '@/theme';
import { Text } from './Text';
import { makeStyles } from './ThemeProvider';

export const EXERCISE_IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

// free-exercise-db trae 2 fotos (inicio / fin): se alternan con fundido
export const ExerciseImage = memo(function ExerciseImage({ images, height = 220 }: { images: string[]; height?: number }) {
  const styles = useStyles();
  const [failed, setFailed] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const [a, b] = images;

  useEffect(() => {
    if (!b) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(900),
      Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [b]);

  if (!a || failed) {
    return (
      <View style={[styles.box, styles.empty, { height }]}>
        <Text variant="label" tone="disabled">{failed ? 'No se pudo cargar la foto' : 'Sin imagen'}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.box, { height }]}>
      <Image source={{ uri: EXERCISE_IMG_BASE + a }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
      {b ? (
        <Animated.Image source={{ uri: EXERCISE_IMG_BASE + b }} style={[StyleSheet.absoluteFill, { opacity: fade }]} resizeMode="cover" />
      ) : null}
    </View>
  );
});

const useStyles = makeStyles((colors) => ({
  box: { overflow: 'hidden', borderRadius: radius.md, borderWidth: line, borderColor: colors.line, backgroundColor: colors.surface },
  empty: { alignItems: 'center', justifyContent: 'center' },
}));
