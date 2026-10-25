// 1RM / training max que pide un método antes de cargarse (bloques con % 1RM o % TM)
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import { useQuery } from '@powersync/react';
import { useEffect, useState } from 'react';
import { E1RM_SQL, E1RM_WHERE } from '@/lib/e1rm';
import { currentUserId, fmtKg, nowIso, parseNum } from './data';

export type MaxNeed = { exerciseId: string; name: string; tm: boolean };

export function needsFromIntensities(rows: { exerciseId: string; name: string; intensity: { type: string } }[]) {
  const out = new Map<string, MaxNeed>();
  for (const r of rows) {
    const t = r.intensity.type;
    if (t !== 'pct_1rm' && t !== 'pct_tm') continue;
    const prev = out.get(r.exerciseId);
    out.set(r.exerciseId, { exerciseId: r.exerciseId, name: r.name, tm: (prev?.tm ?? false) || t === 'pct_tm' });
  }
  return [...out.values()];
}

export function useMaxInputs(needs: MaxNeed[]) {
  const ids = JSON.stringify(needs.map((n) => n.exerciseId));
  const { data: maxes } = useQuery<{ exercise_id: string; one_rm_kg: number | null }>(
    `SELECT exercise_id, one_rm_kg FROM user_exercise_maxes x
     WHERE deleted_at IS NULL AND exercise_id IN (SELECT value FROM json_each(?))
       AND measured_at = (SELECT max(measured_at) FROM user_exercise_maxes y
                          WHERE y.exercise_id = x.exercise_id AND y.deleted_at IS NULL)`,
    [ids],
  );
  const { data: estimates } = useQuery<{ exercise_id: string; e1rm: number }>(
    `SELECT exercise_id, max(${E1RM_SQL()}) AS e1rm
     FROM workout_sets WHERE ${E1RM_WHERE()}
       AND exercise_id IN (SELECT value FROM json_each(?)) GROUP BY exercise_id`,
    [ids],
  );
  const [inputs, setInputs] = useState<Record<string, string>>({});

  // Precarga: último 1RM guardado, si no el estimado del historial
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const n of needs) {
      const mx = maxes.find((x) => x.exercise_id === n.exerciseId)?.one_rm_kg;
      const est = estimates.find((x) => x.exercise_id === n.exerciseId)?.e1rm;
      const v = mx ?? (est ? Math.round(est / 2.5) * 2.5 : null);
      if (v) next[n.exerciseId] = fmtKg(v);
    }
    if (Object.keys(next).length) setInputs((p) => ({ ...next, ...p }));
  }, [maxes.length, estimates.length, ids]);

  const missing = needs.some((n) => !(parseNum(inputs[n.exerciseId] ?? '') ?? 0));

  async function save(db: AbstractPowerSyncDatabase) {
    if (!needs.length) return;
    const userId = await currentUserId(db);
    const ts = nowIso();
    await db.writeTransaction(async (tx) => {
      for (const n of needs) {
        const orm = parseNum(inputs[n.exerciseId] ?? '');
        if (!orm) continue;
        if (maxes.find((x) => x.exercise_id === n.exerciseId)?.one_rm_kg === orm) continue;
        const tm = n.tm ? Math.round((orm * 0.9) / 2.5) * 2.5 : null;
        await tx.execute(
          `INSERT INTO user_exercise_maxes (id, user_id, exercise_id, one_rm_kg, training_max_kg, source, measured_at, updated_at)
           VALUES (uuid(), ?, ?, ?, ?, 'manual', ?, ?)`,
          [userId, n.exerciseId, orm, tm, ts, ts],
        );
      }
    });
  }

  return { inputs, setInput: (id: string, v: string) => setInputs((p) => ({ ...p, [id]: v })), missing, save };
}
