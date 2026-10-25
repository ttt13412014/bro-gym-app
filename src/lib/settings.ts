// Upsert de user_settings (id = user_id). Si la fila no existe todavía, la crea con los valores por defecto.
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import { currentUserId, nowIso } from '@/workout/data';

type Value = string | number | null;
const ALLOWED = new Set([
  'display_name', 'increment_kg', 'increment_db_kg', 'onboarded_at',
  'goal_weight_kg', 'accent_color', 'day_overrides',
]);

export async function setSettings(db: AbstractPowerSyncDatabase, patch: Record<string, Value>) {
  const keys = Object.keys(patch).filter((k) => ALLOWED.has(k));
  if (!keys.length) return;
  const userId = await currentUserId(db);
  const ts = nowIso();
  const vals = keys.map((k) => patch[k] ?? null);
  const ex = await db.getOptional<{ id: string }>('SELECT id FROM user_settings WHERE id = ?', [userId]);
  if (ex) {
    await db.execute(`UPDATE user_settings SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...vals, ts, userId]);
    return;
  }
  const defaults: Record<string, Value> = { weight_unit: 'kg', increment_kg: 2.5, increment_db_kg: 2, equipment: '[]', injured_joints: '[]' };
  const row = { ...defaults, ...Object.fromEntries(keys.map((k, i) => [k, vals[i]!])) };
  const cols = Object.keys(row);
  await db.execute(
    `INSERT INTO user_settings (id, user_id, ${cols.join(', ')}, updated_at) VALUES (?, ?, ${cols.map(() => '?').join(', ')}, ?)`,
    [userId, userId, ...cols.map((c) => row[c] ?? null), ts],
  );
}
