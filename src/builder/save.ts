// Guarda la rutina armada como rutina activa + los inputs en el perfil
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import { currentUserId, nowIso } from '@/workout/data';
import type { BuilderInput, BuiltRoutine, GoalRule } from './build';

const EXPERIENCE: Record<BuilderInput['level'], string> = {
  principiante: 'principiante', intermedio: 'intermedio', avanzado: 'avanzado',
};

export async function saveBuiltRoutine(
  db: AbstractPowerSyncDatabase, built: BuiltRoutine, inp: BuilderInput, rule: GoalRule,
) {
  const userId = await currentUserId(db);
  const ts = nowIso();
  const m = built.method;

  return db.writeTransaction(async (tx) => {
    await tx.execute(
      'UPDATE user_routines SET is_active = 0, updated_at = ? WHERE user_id = ? AND is_active = 1', [ts, userId],
    );

    const { id: routineId } = await tx.get<{ id: string }>('SELECT uuid() AS id');
    const rules = { ...m.rules, builder: { ...inp, cardio: built.cardio, target_weekly: built.targetWeekly } };
    await tx.execute(
      `INSERT INTO user_routines (id, user_id, method_id, name, progression, rules, recovery_days_min,
         source_method_version, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [routineId, userId, m.id, `${m.name} · ${rule.name}`, JSON.stringify(m.default_progression),
        JSON.stringify(rules), m.recovery_days_min, m.version, ts, ts],
    );

    for (const d of built.days) {
      const { id: dayId } = await tx.get<{ id: string }>('SELECT uuid() AS id');
      await tx.execute(
        `INSERT INTO user_routine_days (id, user_id, routine_id, day_index, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [dayId, userId, routineId, d.day_index, d.name, ts, ts],
      );
      for (const b of d.blocks) {
        await tx.execute(
          `INSERT INTO user_routine_blocks (id, user_id, routine_day_id, source_block_id, position, exercise_id,
             set_type, sets, reps_min, reps_max, rep_unit, rest_sec, tempo, intensity, technique_id,
             technique_params, group_key, progression, notes, created_at, updated_at)
           VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, dayId, b.source_block_id, b.position, b.exercise_id, b.set_type, b.sets, b.reps_min, b.reps_max,
            b.rep_unit, b.rest_sec, b.tempo, JSON.stringify(b.intensity), b.technique_id,
            b.technique_params == null ? null : JSON.stringify(b.technique_params), b.group_key,
            b.progression == null ? null : JSON.stringify(b.progression), b.changed ?? b.notes, ts, ts],
        );
      }
    }

    // Perfil: id = user_id (no hay upsert sobre vistas de PowerSync)
    const settings = {
      goal: inp.goal, experience: EXPERIENCE[inp.level], days_available: inp.days,
      minutes_per_session: inp.minutes, equipment: JSON.stringify([inp.equipment]),
      injured_joints: JSON.stringify(inp.injuries),
    };
    const exists = await tx.getOptional<{ id: string }>('SELECT id FROM user_settings WHERE id = ?', [userId]);
    if (exists) {
      await tx.execute(
        `UPDATE user_settings SET goal = ?, experience = ?, days_available = ?, minutes_per_session = ?,
           equipment = ?, injured_joints = ?, updated_at = ? WHERE id = ?`,
        [settings.goal, settings.experience, settings.days_available, settings.minutes_per_session,
          settings.equipment, settings.injured_joints, ts, userId],
      );
    } else {
      await tx.execute(
        `INSERT INTO user_settings (id, user_id, weight_unit, increment_kg, increment_db_kg, goal, experience,
           days_available, minutes_per_session, equipment, injured_joints, updated_at)
         VALUES (?, ?, 'kg', 2.5, 2, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, userId, settings.goal, settings.experience, settings.days_available, settings.minutes_per_session,
          settings.equipment, settings.injured_joints, ts],
      );
    }
    return routineId;
  });
}
