// Esquema local (SQLite) que replica PowerSync.
// Tipos: uuid / fechas / jsonb / text[] -> text (JSON), int / boolean -> integer, numeric -> real.
// `id` lo crea PowerSync. workout_sets.e1rm_kg NO viene: Postgres 16 no replica columnas
// generadas; el e1RM se calcula en el cliente (src/lib/progression.ts).
import { column, Schema, Table } from '@powersync/react-native';

const t = column.text;
const i = column.integer;
const r = column.real;

const sync = { created_at: t, updated_at: t, deleted_at: t };

// ------------------------------------------------------------- catálogo
const exercises = new Table(
  {
    slug: t, source: t, source_id: t, name: t, name_es: t, category: t, mechanic: t, force: t,
    level: t, equipment: t, primary_muscles: t, secondary_muscles: t, images: t, gif_url: t,
    instructions: t, owner_id: t, movement_pattern: t, joints: t, ...sync,
  },
  { indexes: { slug: ['slug'], pattern: ['movement_pattern'] } },
);

const methods = new Table(
  {
    slug: t, name: t, creator: t, summary: t, target: t, category: t, goals: t, level: t,
    days_min: i, days_max: i, equipment: t, sets_reps_rest: t, intensity_summary: t,
    recovery_days_min: i, requires_one_rm: i, default_progression: t, rules: t,
    volume_score: i, intensity_score: i, frequency_score: i, is_published: i, version: i,
    created_at: t, updated_at: t,
  },
  { indexes: { slug: ['slug'] } },
);

const techniques = new Table({
  slug: t, name: t, description: t, params_schema: t, is_public: i, created_at: t, updated_at: t,
});

const method_templates = new Table(
  { method_id: t, day_index: i, name: t, created_at: t, updated_at: t },
  { indexes: { method: ['method_id', 'day_index'] } },
);

const template_blocks = new Table(
  {
    template_id: t, position: i, exercise_id: t, set_type: t, sets: i, reps_min: i, reps_max: i,
    rep_unit: t, rest_sec: i, tempo: t, intensity: t, technique_id: t, technique_params: t,
    group_key: t, progression: t, notes: t, created_at: t, updated_at: t,
  },
  { indexes: { template: ['template_id', 'position'] } },
);

const exercise_substitutes = new Table(
  { exercise_id: t, substitute_id: t, priority: i },
  { indexes: { exercise: ['exercise_id'] } },
);

const builder_goal_rules = new Table({
  goal: t, name: t, method_goal: t,
  compound_reps_min: i, compound_reps_max: i, isolation_reps_min: i, isolation_reps_max: i,
  rir_min: i, rir_max: i, isolation_rir_min: i, isolation_rir_max: i,
  sets_week_min: i, sets_week_max: i, cardio_z2_min_week: i, cardio_z2_max_week: i,
  steps_target: i, hiit_per_week: i, no_hiit_before_legs: i, sec_per_set: i, updated_at: t,
});

const strength_levels = new Table({ // id = slug
  slug: t, rank: i, name: t, icon: t, uses_accent: i, updated_at: t,
});

const strength_standards = new Table(
  {
    lift: t, exercise_id: t, sex: t, level_slug: t, bw_multiple: r, ref_height_cm: r,
    height_adj_per_cm: r, height_adj_max: r, updated_at: t,
  },
  { indexes: { lift: ['lift', 'sex'] } },
);

// ------------------------------------------------------------- usuario
const user_settings = new Table({ // id = user_id
  user_id: t, weight_unit: t, increment_kg: r, increment_db_kg: r, goal: t, experience: t,
  days_available: i, equipment: t, minutes_per_session: i, injured_joints: t,
  display_name: t, strength_level: t, strength_level_since: t,
  onboarded_at: t,
  goal_weight_kg: r, accent_color: t, day_overrides: t, // meta de peso, color de acento, días movidos (JSON)
  updated_at: t,
});

const user_exercise_maxes = new Table(
  {
    user_id: t, exercise_id: t, one_rm_kg: r, training_max_kg: r, source: t, measured_at: t,
    updated_at: t, deleted_at: t,
  },
  { indexes: { exercise: ['exercise_id', 'measured_at'] } },
);

const user_routines = new Table({
  user_id: t, method_id: t, name: t, progression: t, rules: t, recovery_days_min: i,
  source_method_version: i, is_active: i, ...sync,
});

const user_routine_days = new Table(
  { user_id: t, routine_id: t, day_index: i, name: t, ...sync },
  { indexes: { routine: ['routine_id', 'day_index'] } },
);

const user_routine_blocks = new Table(
  {
    user_id: t, routine_day_id: t, source_block_id: t, position: i, exercise_id: t, set_type: t,
    sets: i, reps_min: i, reps_max: i, rep_unit: t, rest_sec: i, tempo: t, intensity: t,
    technique_id: t, technique_params: t, group_key: t, progression: t, notes: t, ...sync,
  },
  { indexes: { day: ['routine_day_id', 'position'] } },
);

const plans = new Table({
  user_id: t, routine_id: t, name: t, start_date: t, weeks: i, status: t, ...sync,
});

const plan_weeks = new Table(
  {
    user_id: t, plan_id: t, week_index: i, kind: t, volume_mult: r, intensity_mult: r,
    rir_offset: i, updated_at: t, deleted_at: t,
  },
  { indexes: { plan: ['plan_id', 'week_index'] } },
);

const user_progression_state = new Table(
  {
    user_id: t, routine_block_id: t, next_weight_kg: r, next_reps: i, wave_week: i,
    fail_streak: i, last_session_id: t, updated_at: t,
  },
  { indexes: { block: ['routine_block_id'] } },
);

const workout_sessions = new Table(
  {
    user_id: t, routine_id: t, routine_day_id: t, plan_week_id: t, started_at: t, ended_at: t,
    bodyweight_kg: r, session_rpe: r, notes: t, ...sync,
  },
  { indexes: { started: ['started_at'] } },
);

const workout_sets = new Table(
  {
    user_id: t, session_id: t, exercise_id: t, routine_block_id: t, set_index: i, set_type: t,
    parent_set_id: t, weight_kg: r, reps: i, rep_unit: t, rir: i, rpe: r, tempo: t,
    rest_sec_target: i, rest_sec_actual: i, target: t, completed_at: t, ...sync,
  },
  {
    indexes: {
      session: ['session_id', 'set_index'],
      block: ['routine_block_id', 'completed_at'],
      exercise: ['exercise_id', 'completed_at'],
    },
  },
);

const body_measurements = new Table(
  {
    user_id: t, measured_at: t, weight_kg: r, body_fat_pct: r, neck_cm: r, chest_cm: r,
    waist_cm: r, hip_cm: r, arm_cm: r, thigh_cm: r, calf_cm: r, photo_path: t, notes: t,
    updated_at: t, deleted_at: t,
  },
  { indexes: { measured: ['measured_at'] } },
);

const user_strength_levels = new Table(
  {
    user_id: t, lift: t, level_slug: t, best_e1rm_kg: r, bodyweight_kg: r, ratio: r,
    next_level_slug: t, kg_to_next: r, computed_at: t, updated_at: t, deleted_at: t,
  },
  { indexes: { lift: ['lift'] } },
);

// ------------------------------------------------------------- nutrición
const foods = new Table(
  {
    owner_id: t, source: t, barcode: t, name: t, brand: t, kcal_100g: r, protein_100g: r,
    carbs_100g: r, fat_100g: r, fiber_100g: r, serving_g: r, serving_label: t, image_url: t,
    off_updated_at: t, is_favorite: i, ...sync,
  },
  { indexes: { barcode: ['barcode'], name: ['name'] } },
);

const nutrition_profiles = new Table({ // id = user_id
  user_id: t, sex: t, birth_date: t, height_cm: r, activity_factor: r, goal: t, rate_kg_week: r,
  protein_g_kg: r, fat_pct_kcal: r, auto_adjust: i, updated_at: t,
});

const nutrition_targets = new Table(
  {
    user_id: t, valid_from: t, bmr: i, tdee: i, kcal: i, protein_g: i, carbs_g: i, fat_g: i,
    reason: t, checkin_id: t, adjust_kcal: i, ...sync,
  },
  { indexes: { valid: ['valid_from'] } },
);

const food_logs = new Table(
  {
    user_id: t, log_date: t, meal: t, food_id: t, food_name: t, grams: r, kcal: r,
    protein_g: r, carbs_g: r, fat_g: r, logged_at: t, ...sync,
  },
  { indexes: { date: ['log_date', 'meal'] } },
);

const weekly_checkins = new Table(
  {
    user_id: t, week_start: t, avg_weight_kg: r, change_kg: r, target_change_kg: r,
    avg_kcal_logged: i, days_logged: i, adherence_pct: i, adjustment_kcal: i, applied: i, ...sync,
  },
  { indexes: { week: ['week_start'] } },
);

export const AppSchema = new Schema({
  exercises, methods, techniques, method_templates, template_blocks, exercise_substitutes,
  builder_goal_rules, strength_levels, strength_standards,
  user_settings, user_strength_levels, user_exercise_maxes, user_routines, user_routine_days, user_routine_blocks,
  plans, plan_weeks, user_progression_state, workout_sessions, workout_sets, body_measurements,
  foods, nutrition_profiles, nutrition_targets, food_logs, weekly_checkins,
});

export type Database = (typeof AppSchema)['types'];
export type TableName = keyof Database;
