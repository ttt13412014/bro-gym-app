// user_id disponible sin red: se guarda al iniciar sesión y no depende de que el token esté vigente
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import { supabase } from './supabase';

const KEY = 'judiogym.user_id';
let cached: string | null = null;

export async function rememberUserId(id: string) {
  cached = id;
  await AsyncStorage.setItem(KEY, id);
}

export async function forgetUserId() {
  cached = null;
  await AsyncStorage.removeItem(KEY);
}

// Solo lo cacheado (para decidir si mostrar login sin red)
export async function storedUserId() {
  return cached ?? (cached = await AsyncStorage.getItem(KEY));
}

export async function currentUserId(db?: AbstractPowerSyncDatabase): Promise<string> {
  const stored = await storedUserId();
  if (stored) return stored;

  const { data } = await supabase.auth.getSession();
  const fromSession = data.session?.user.id;
  if (fromSession) { await rememberUserId(fromSession); return fromSession; }

  // Último recurso: cualquier fila propia ya sincronizada
  const row = await db?.getOptional<{ user_id: string }>(
    `SELECT user_id FROM user_settings UNION ALL SELECT user_id FROM user_routines
     UNION ALL SELECT user_id FROM workout_sessions LIMIT 1`,
  );
  if (row?.user_id) { await rememberUserId(row.user_id); return row.user_id; }

  throw new Error('No se encontró el usuario. Entrá con señal una vez.');
}
