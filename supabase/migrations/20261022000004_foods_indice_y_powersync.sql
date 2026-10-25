-- =====================================================================
-- Bro? · 004 — índice parcial en foods + publicación para PowerSync
-- =====================================================================
begin;

-- Reescanear un alimento borrado (soft delete) no debe chocar con el viejo
alter table foods drop constraint foods_owner_id_barcode_key;
create unique index foods_owner_barcode_uniq
  on foods (owner_id, barcode)
  where deleted_at is null and barcode is not null;

-- Tablas que replica PowerSync
create publication powersync for table
  exercises, methods, techniques, method_templates, template_blocks,
  exercise_substitutes, builder_goal_rules,
  user_settings, user_exercise_maxes, user_routines, user_routine_days,
  user_routine_blocks, plans, plan_weeks, user_progression_state,
  workout_sessions, workout_sets, body_measurements,
  foods, nutrition_profiles, nutrition_targets, food_logs, weekly_checkins;

commit;

-- Rol de replicación para PowerSync (correr una vez, a mano, con tu contraseña):
-- create role powersync_role with replication bypassrls login password '<CAMBIAR>';
-- grant select on all tables in schema public to powersync_role;
-- alter default privileges in schema public grant select on tables to powersync_role;
