import { useStatus } from '@powersync/react';
import { Text } from './Text';

// Sin color ni ícono: solo texto, y solo cuando importa
export function SyncStatus() {
  const status = useStatus();
  if (!status.hasSynced) return <Text variant="label" style={{ textAlign: 'right' }}>Sincronizando</Text>;
  if (!status.connected) return <Text variant="label" style={{ textAlign: 'right' }}>Sin conexión · guardado local</Text>;
  return null;
}
