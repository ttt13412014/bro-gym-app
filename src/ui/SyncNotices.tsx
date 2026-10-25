import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onSyncNotice, type SyncNotice } from '@/db/syncEvents';
import { gutter, line, space } from '@/theme';
import { Text } from './Text';
import { makeStyles, useTheme } from './ThemeProvider';

// Barra fina arriba, sin color: se cierra tocándola
export function SyncNotices() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [notice, setNotice] = useState<SyncNotice | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => onSyncNotice(setNotice), []);
  if (!notice) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top }]}>
      <Pressable onPress={() => setNotice(null)} style={styles.bar} accessibilityRole="alert">
        <Text variant="label">{notice.kind === 'merged' ? 'Sincronización' : 'No se pudo sincronizar'}</Text>
        <Text variant="small" style={{ color: colors.text, marginTop: space.xs }}>{notice.message}</Text>
        <Text variant="label" tone="disabled" style={{ marginTop: space.sm }}>Tocá para cerrar</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { position: 'absolute', left: 0, right: 0, zIndex: 10 },
  bar: {
    backgroundColor: colors.surface,
    borderBottomWidth: line,
    borderBottomColor: colors.line,
    paddingHorizontal: gutter,
    paddingVertical: space.md,
  },
}));
