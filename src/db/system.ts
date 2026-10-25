import { PowerSyncDatabase } from '@powersync/react-native';
import { connector } from './connector';
import { AppSchema } from './schema';

export const powersync = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'judiogym.db' },
});

export async function connectSync() {
  await powersync.connect(connector);
}

// Al cerrar sesión: corta el sync y borra la base local de ese usuario
export async function resetSync() {
  await powersync.disconnectAndClear();
}

export const nowIso = () => new Date().toISOString();
