// Avisos del sync para mostrar al usuario (unificaciones y rechazos del servidor)
export type SyncNotice = { id: number; kind: 'merged' | 'rejected'; message: string };
type Listener = (n: SyncNotice) => void;

const listeners = new Set<Listener>();
let seq = 0;

export function onSyncNotice(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function emitSyncNotice(kind: SyncNotice['kind'], message: string) {
  const n = { id: ++seq, kind, message };
  listeners.forEach((l) => l(n));
}
