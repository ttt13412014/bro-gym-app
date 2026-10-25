// Superseries armadas durante la sesión: se guardan en el día de la rutina (group_key de cada bloque),
// así la próxima vez ya vienen juntas. Se separan con un toque.
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import { nowIso, type BlockRow } from './data';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Grupos con 2 o más ejercicios (un group_key solo no es superserie)
export function groupMembers(blocks: BlockRow[], key: string | null) {
  return key ? blocks.filter((b) => b.group_key === key) : [];
}
export const inGroup = (blocks: BlockRow[], b: BlockRow) => groupMembers(blocks, b.group_key).length > 1;

// Orden de pantalla: los de una superserie quedan juntos, donde aparece el primero
export function displayUnits(blocks: BlockRow[]): { key: string; group: string | null; items: BlockRow[] }[] {
  const out: { key: string; group: string | null; items: BlockRow[] }[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    if (seen.has(b.id)) continue;
    const members = groupMembers(blocks, b.group_key);
    if (members.length > 1) {
      members.forEach((m) => seen.add(m.id));
      out.push({ key: `g-${b.group_key}`, group: b.group_key, items: members });
    } else {
      seen.add(b.id);
      out.push({ key: b.id, group: null, items: [b] });
    }
  }
  return out;
}

export async function pairBlocks(db: AbstractPowerSyncDatabase, a: BlockRow, b: BlockRow, blocks: BlockRow[]) {
  if (a.id === b.id) return;
  const used = new Set(blocks.filter((x) => inGroup(blocks, x)).map((x) => x.group_key));
  const key = (inGroup(blocks, b) && b.group_key) || (inGroup(blocks, a) && a.group_key)
    || [...LETTERS].find((l) => !used.has(l)) || 'Z';
  const ts = nowIso();
  await db.execute('UPDATE user_routine_blocks SET group_key = ?, updated_at = ? WHERE id IN (?, ?)', [key, ts, a.id, b.id]);
}

// Saca un ejercicio de su superserie; si queda uno solo, se disuelve
export async function unpairBlock(db: AbstractPowerSyncDatabase, b: BlockRow, blocks: BlockRow[]) {
  const rest = groupMembers(blocks, b.group_key).filter((x) => x.id !== b.id);
  const ids = [b.id, ...(rest.length < 2 ? rest.map((x) => x.id) : [])];
  const ts = nowIso();
  await db.execute(
    `UPDATE user_routine_blocks SET group_key = NULL, updated_at = ? WHERE id IN (${ids.map(() => '?').join(', ')})`,
    [ts, ...ids],
  );
}
