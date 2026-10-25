// Trae el acento guardado en user_settings (sincronizado entre teléfonos) y lo aplica al tema.
import { useQuery } from '@powersync/react';
import { useEffect } from 'react';
import { isHex } from '@/theme';
import { useTheme } from './ThemeProvider';

export function AccentSync() {
  const { setAccent } = useTheme();
  const { data } = useQuery<{ accent_color: string | null }>('SELECT accent_color FROM user_settings LIMIT 1');
  const remote = data[0]?.accent_color;
  useEffect(() => { if (isHex(remote)) setAccent(remote); }, [remote, setAccent]);
  return null;
}
