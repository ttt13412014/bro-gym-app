import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { localIso } from './nutrition';

// Fecha local de hoy que cambia sola a la medianoche (y al volver a la app al otro día)
export function useToday() {
  const [d, setD] = useState(() => localIso(new Date()));
  useEffect(() => {
    const check = () => setD((prev) => { const t = localIso(new Date()); return t === prev ? prev : t; });
    const id = setInterval(check, 60_000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => { clearInterval(id); sub.remove(); };
  }, []);
  return d;
}
