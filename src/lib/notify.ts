// Permisos y canales de notificaciones locales (recordatorios y descanso)
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let channelsReady = false;
async function channels() {
  if (channelsReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('ciclo', {
    name: 'Recordatorios', importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync('descanso', {
    name: 'Fin del descanso', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 400, 150, 400],
  });
  channelsReady = true;
}

// ask = false: solo consulta (para segundo plano); ask = true: pide si todavía se puede
export async function ensureNotifications(ask: boolean) {
  await channels();
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!ask || !cur.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}
