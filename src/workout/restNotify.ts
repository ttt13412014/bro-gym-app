// Aviso de fin de descanso con la app en segundo plano o la pantalla apagada.
// Con la app abierta no se muestra (ya vibra el temporizador): ver el handler en app/_layout.tsx.
import * as Notifications from 'expo-notifications';
import { ensureNotifications } from '@/lib/notify';

export const REST_KIND = 'descanso';
let currentId: string | null = null;
let tail: Promise<unknown> = Promise.resolve();
const serial = (fn: () => Promise<void>) => { tail = tail.then(fn, fn).catch(() => {}); return tail; };

async function cancelCurrent() {
  if (!currentId) return;
  const id = currentId;
  currentId = null;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

export function scheduleRestEnd(endAt: number) {
  return serial(async () => {
    await cancelCurrent();
    if (endAt - Date.now() < 2000 || !(await ensureNotifications(false))) return;
    currentId = await Notifications.scheduleNotificationAsync({
      content: { title: 'Descanso terminado', body: 'Va la próxima serie', sound: true, data: { kind: REST_KIND } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endAt), channelId: REST_KIND },
    });
  });
}

export function cancelRestEnd() {
  return serial(cancelCurrent);
}
