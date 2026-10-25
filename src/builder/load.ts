// Catálogo local (SQLite) -> estructura que usa el armador
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import { parseJson } from '@/workout/data';
import type { Catalog, CatBlock, CatExercise, CatMethod, Goal, GoalRule } from './build';

type Raw = Record<string, unknown>;

export async function loadCatalog(db: AbstractPowerSyncDatabase): Promise<Catalog> {
  const [methods, templates, blocks, exercises, subs, rules] = await Promise.all([
    db.getAll<Raw>('SELECT * FROM methods WHERE is_published = 1'),
    db.getAll<Raw>('SELECT * FROM method_templates ORDER BY day_index'),
    db.getAll<Raw>('SELECT * FROM template_blocks ORDER BY position'),
    db.getAll<Raw>(
      `SELECT id, slug, name_es, mechanic, equipment, movement_pattern, primary_muscles, joints, images
       FROM exercises WHERE deleted_at IS NULL`,
    ),
    db.getAll<{ exercise_id: string; substitute_id: string; priority: number }>(
      'SELECT exercise_id, substitute_id, priority FROM exercise_substitutes ORDER BY priority',
    ),
    db.getAll<Raw>('SELECT * FROM builder_goal_rules'),
  ]);

  const exMap = new Map<string, CatExercise>();
  for (const e of exercises) {
    exMap.set(String(e.id), {
      id: String(e.id), slug: String(e.slug), name_es: String(e.name_es),
      mechanic: (e.mechanic as string) ?? null, equipment: (e.equipment as string) ?? null,
      movement_pattern: (e.movement_pattern as string) ?? null,
      primary_muscles: parseJson<string[]>(e.primary_muscles as string, []),
      joints: parseJson<string[]>(e.joints as string, []),
      images: (e.images as string) ?? null,
    });
  }

  const subMap = new Map<string, { substitute_id: string; priority: number }[]>();
  for (const s of subs) subMap.set(s.exercise_id, [...(subMap.get(s.exercise_id) ?? []), s]);

  const blocksBy = new Map<string, CatBlock[]>();
  for (const b of blocks) {
    const cb: CatBlock = {
      id: String(b.id), template_id: String(b.template_id), position: Number(b.position),
      exercise_id: String(b.exercise_id), set_type: String(b.set_type), sets: Number(b.sets),
      reps_min: Number(b.reps_min), reps_max: Number(b.reps_max), rep_unit: String(b.rep_unit),
      rest_sec: Number(b.rest_sec), tempo: (b.tempo as string) ?? null,
      intensity: parseJson(b.intensity as string, { type: 'none' }),
      technique_id: (b.technique_id as string) ?? null,
      technique_params: parseJson<unknown>(b.technique_params as string, null),
      group_key: (b.group_key as string) ?? null,
      progression: parseJson<{ kind: string } | null>(b.progression as string, null),
      notes: (b.notes as string) ?? null,
    };
    blocksBy.set(cb.template_id, [...(blocksBy.get(cb.template_id) ?? []), cb]);
  }

  const cm: CatMethod[] = methods.map((m) => ({
    id: String(m.id), slug: String(m.slug), name: String(m.name), category: String(m.category),
    goals: parseJson<string[]>(m.goals as string, []), level: m.level as CatMethod['level'],
    days_min: Number(m.days_min), days_max: Number(m.days_max),
    equipment: parseJson<string[]>(m.equipment as string, []),
    default_progression: parseJson<unknown>(m.default_progression as string, null),
    rules: parseJson<Record<string, unknown>>(m.rules as string, {}),
    recovery_days_min: Number(m.recovery_days_min), version: Number(m.version),
    templates: templates
      .filter((t) => t.method_id === m.id)
      .map((t) => ({
        id: String(t.id), day_index: Number(t.day_index), name: String(t.name),
        blocks: blocksBy.get(String(t.id)) ?? [],
      })),
  }));

  const ruleMap = new Map<Goal, GoalRule>();
  for (const r of rules) {
    ruleMap.set(r.goal as Goal, { ...(r as unknown as GoalRule), no_hiit_before_legs: Boolean(r.no_hiit_before_legs) });
  }

  return { methods: cm, exercises: exMap, substitutes: subMap, rules: ruleMap };
}
