-- =====================================================================
-- 013 — meta de peso, color de acento y días movidos (overrides puntuales por fecha)
-- Columnas nulas en user_settings: ya tiene RLS own_rows (user_id = auth.uid())
-- y está en la publicación powersync; las sync rules usan SELECT * (no hace falta tocarlas).
-- day_overrides: {"AAAA-MM-DD": "<routine_day_id>" | "descanso"}
-- =====================================================================
alter table public.user_settings
  add column if not exists goal_weight_kg numeric check (goal_weight_kg is null or (goal_weight_kg between 30 and 300)),
  add column if not exists accent_color text check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists day_overrides jsonb;
