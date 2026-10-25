import { useQuery } from '@powersync/react';
import { View } from 'react-native';
import { space } from '@/theme';
import { LevelIcon, type LevelIconName } from './LevelIcon';
import { Text } from './Text';

// Nombre + ícono del nivel general. Solo cambia cuando cambia user_settings.strength_level.
// accent=false en pantallas que ya tienen su acento (Home: botón principal)
export function UserBadge({
  size = 20, showName = true, accent = true,
}: { size?: number; showName?: boolean; accent?: boolean }) {
  const { data } = useQuery<{ display_name: string | null; icon: string | null; name: string | null; uses_accent: number | null }>(
    `SELECT s.display_name, l.icon, l.name, l.uses_accent
     FROM user_settings s LEFT JOIN strength_levels l ON l.slug = s.strength_level LIMIT 1`,
  );
  const u = data[0];
  if (!u?.icon && !u?.display_name) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1, maxWidth: '100%' }} accessibilityLabel={u.name ?? undefined}>
      {showName && u.display_name ? <Text variant="label" numberOfLines={1} style={{ textTransform: 'none', flexShrink: 1 }}>{u.display_name}</Text> : null}
      {u.icon ? <View style={{ flexShrink: 0 }}><LevelIcon icon={u.icon as LevelIconName} accent={accent && !!u.uses_accent} size={size} /></View> : null}
    </View>
  );
}
