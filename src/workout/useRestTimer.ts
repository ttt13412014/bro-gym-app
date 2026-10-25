import { useCallback, useEffect, useReducer, useState } from 'react';
import { Vibration } from 'react-native';
import { cancelRestEnd, scheduleRestEnd } from './restNotify';

// Temporizador basado en hora de fin: sobrevive a pantalla apagada / app en segundo plano.
// No re-renderiza la pantalla que lo usa mientras corre: el segundero vive en useCountdown (RestBar).
export function useRestTimer() {
  const [endAt, setEndAt] = useState<number | null>(null);
  const [total, setTotal] = useState(0);

  // revisa cada 250 ms si terminó, pero sin setState hasta el final: la sesión no se re-renderiza
  useEffect(() => {
    if (endAt == null) return;
    const id = setInterval(() => {
      if (Date.now() >= endAt) { Vibration.vibrate([0, 400, 150, 400]); setEndAt(null); }
    }, 250);
    return () => clearInterval(id);
  }, [endAt]);

  // aviso del sistema por si la app queda en segundo plano; se cancela al saltear, terminar o salir
  useEffect(() => {
    if (endAt == null) { cancelRestEnd(); return; }
    scheduleRestEnd(endAt);
  }, [endAt]);
  useEffect(() => () => { cancelRestEnd(); }, []);

  const start = useCallback((sec: number) => {
    if (sec <= 0) return;
    setTotal(sec);
    setEndAt(Date.now() + sec * 1000);
  }, []);

  const add = useCallback((delta: number) => {
    setEndAt((e) => (e == null ? e : Math.max(Date.now() + 1000, e + delta * 1000)));
    setTotal((t) => Math.max(1, t + delta));
  }, []);

  const skip = useCallback(() => setEndAt(null), []);

  return { active: endAt != null, endAt, total, start, add, skip };
}

// Segundos que faltan hasta endAt; re-renderiza solo al componente que lo usa
export function useCountdown(endAt: number | null) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (endAt == null) return;
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endAt]);
  return endAt == null ? 0 : Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
}

// Re-render cada `ms` (para relojes que cambian despacio, ej. minutos de sesión)
export function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

export const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
