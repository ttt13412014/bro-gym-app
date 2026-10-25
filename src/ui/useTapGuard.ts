import { useCallback, useEffect, useRef, useState } from 'react';
import { showError } from './feedback';

// Evita el doble toque: mientras corre una acción async (o 450 ms después de una sync,
// ej. navegar) los toques extra se ignoran. `busy` es true mientras corre la promesa.
export function useTapGuard<A extends unknown[]>(fn: ((...a: A) => unknown) | null | undefined, cooldownMs = 450) {
  const lock = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const run = useCallback((...a: A) => {
    if (!fn || lock.current) return;
    lock.current = true;
    let r: unknown;
    try { r = fn(...a); } catch (e) { lock.current = false; showError('No se pudo completar', e); return; }
    if (r instanceof Promise) {
      setBusy(true);
      r.catch((e) => showError('No se pudo completar', e)).finally(() => {
        lock.current = false;
        if (mounted.current) setBusy(false);
      });
    } else {
      setTimeout(() => { lock.current = false; }, cooldownMs);
    }
  }, [fn, cooldownMs]);

  return { run, busy };
}
