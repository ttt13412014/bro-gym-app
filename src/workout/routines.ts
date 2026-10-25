// Cargar un método como rutina del usuario, en local (misma lógica que clone_method_to_routine)
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import { currentUserId, nowIso } from './data';

export async function cloneMethodLocal(db: AbstractPowerSyncDatabase, methodId: string, name?: string) {
  const userId = await currentUserId(db);
  const ts = nowIso();

  return db.writeTransaction(async (tx) => {
    const m = await tx.get<{
      id: string; name: string; default_progression: string; rules: string;
      recovery_days_min: number; version: number;
    }>('SELECT id, name, default_progression, rules, recovery_days_min, version FROM methods WHERE id = ?', [methodId]);

    // una sola rutina activa
    await tx.execute(
      'UPDATE user_routines SET is_active = 0, updated_at = ? WHERE user_id = ? AND is_active = 1',
      [ts, userId],
    );

    const { id: routineId } = await tx.get<{ id: string }>('SELECT uuid() AS id');
    await tx.execute(
      `INSERT INTO user_routines (id, user_id, method_id, name, progression, rules, recovery_days_min,
         source_method_version, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [routineId, userId, m.id, name ?? m.name, m.default_progression, m.rules, m.recovery_days_min, m.version, ts, ts],
    );

    const days = await tx.getAll<{ id: string; day_index: number; name: string }>(
      'SELECT id, day_index, name FROM method_templates WHERE method_id = ? ORDER BY day_index', [m.id],
    );
    for (const d of days) {
      const { id: dayId } = await tx.get<{ id: string }>('SELECT uuid() AS id');
      await tx.execute(
        `INSERT INTO user_routine_days (id, user_id, routine_id, day_index, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [dayId, userId, routineId, d.day_index, d.name, ts, ts],
      );
      // uuid() por fila dentro del INSERT ... SELECT
      await tx.execute(
        `INSERT INTO user_routine_blocks (id, user_id, routine_day_id, source_block_id, position, exercise_id,
           set_type, sets, reps_min, reps_max, rep_unit, rest_sec, tempo, intensity, technique_id,
           technique_params, group_key, progression, notes, created_at, updated_at)
         SELECT uuid(), ?, ?, b.id, b.position, b.exercise_id, b.set_type, b.sets, b.reps_min, b.reps_max,
           b.rep_unit, b.rest_sec, b.tempo, b.intensity, b.technique_id, b.technique_params, b.group_key,
           b.progression, b.notes, ?, ?
         FROM template_blocks b WHERE b.template_id = ?`,
        [userId, dayId, ts, ts, d.id],
      );
    }
    return routineId;
  });
}
