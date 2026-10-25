-- =====================================================================
-- Bro? · 003_nutricion_y_armador.sql
-- Requiere 001_schema.sql y 002_seed_metodos.sql
-- =====================================================================
begin;

-- =====================================================================
-- 1. EJERCICIOS: patrón de movimiento + articulaciones que carga
-- =====================================================================
alter table exercises
  add column movement_pattern text check (movement_pattern in (
    'squat','hinge','lunge','horizontal_push','vertical_push','horizontal_pull','vertical_pull',
    'knee_extension','knee_flexion','hip_extension','elbow_flexion','elbow_extension',
    'shoulder_abduction','chest_fly','rear_delt','shrug','calf','core')),
  add column joints text[] not null default '{}'
    check (joints <@ array['rodilla','cadera','lumbar','hombro','codo','muneca','tobillo','cuello']);

create index exercises_joints_idx on exercises using gin (joints);

update exercises e set movement_pattern = v.p, joints = v.j
from (values
  ('back-squat','squat','{rodilla,cadera,lumbar}'::text[]),
  ('front-squat','squat','{rodilla,cadera,muneca}'),
  ('bw-squat','squat','{rodilla,cadera}'),
  ('leg-press','squat','{rodilla,cadera}'),
  ('deadlift','hinge','{lumbar,cadera}'),
  ('romanian-deadlift','hinge','{lumbar,cadera}'),
  ('hip-thrust','hip_extension','{cadera}'),
  ('glute-bridge','hip_extension','{cadera}'),
  ('db-lunge','lunge','{rodilla,cadera}'),
  ('bw-lunge','lunge','{rodilla,cadera}'),
  ('bench-press','horizontal_push','{hombro,codo,muneca}'),
  ('incline-bench-press','horizontal_push','{hombro,codo,muneca}'),
  ('incline-db-press','horizontal_push','{hombro,codo}'),
  ('close-grip-bench','horizontal_push','{codo,muneca,hombro}'),
  ('push-up','horizontal_push','{hombro,muneca}'),
  ('dip','horizontal_push','{hombro,codo}'),
  ('overhead-press','vertical_push','{hombro,lumbar,codo}'),
  ('db-shoulder-press','vertical_push','{hombro,codo}'),
  ('arnold-press','vertical_push','{hombro,codo}'),
  ('pike-push-up','vertical_push','{hombro,muneca}'),
  ('barbell-row','horizontal_pull','{lumbar,codo}'),
  ('db-row','horizontal_pull','{codo}'),
  ('seated-cable-row','horizontal_pull','{codo}'),
  ('inverted-row','horizontal_pull','{codo,hombro}'),
  ('pull-up','vertical_pull','{hombro,codo}'),
  ('chin-up','vertical_pull','{hombro,codo}'),
  ('lat-pulldown','vertical_pull','{hombro,codo}'),
  ('close-grip-pulldown','vertical_pull','{hombro,codo}'),
  ('pullover','vertical_pull','{hombro}'),
  ('leg-extension','knee_extension','{rodilla}'),
  ('leg-curl','knee_flexion','{rodilla}'),
  ('calf-raise','calf','{tobillo}'),
  ('lateral-raise','shoulder_abduction','{hombro}'),
  ('rear-delt-fly','rear_delt','{hombro}'),
  ('face-pull','rear_delt','{hombro}'),
  ('shrug','shrug','{cuello}'),
  ('db-fly','chest_fly','{hombro}'),
  ('cable-fly','chest_fly','{hombro}'),
  ('pec-deck','chest_fly','{hombro}'),
  ('barbell-curl','elbow_flexion','{codo,muneca}'),
  ('db-curl','elbow_flexion','{codo}'),
  ('hammer-curl','elbow_flexion','{codo}'),
  ('preacher-curl','elbow_flexion','{codo}'),
  ('triceps-pushdown','elbow_extension','{codo}'),
  ('skull-crusher','elbow_extension','{codo}'),
  ('overhead-triceps-ext','elbow_extension','{codo,hombro}'),
  ('hanging-leg-raise','core','{hombro,cadera}'),
  ('plank','core','{lumbar}')
) v(slug, p, j)
where e.slug = v.slug;

-- Reemplazos sugeridos cuando una lesión excluye un ejercicio
create table exercise_substitutes (
  exercise_id   uuid not null references exercises on delete cascade,
  substitute_id uuid not null references exercises on delete cascade,
  priority      int  not null default 1,
  primary key (exercise_id, substitute_id)
);

insert into exercise_substitutes (exercise_id, substitute_id, priority)
select a.id, b.id, v.prio from (values
  ('back-squat','leg-press',1), ('back-squat','db-lunge',2),
  ('front-squat','leg-press',1),
  ('deadlift','hip-thrust',1), ('deadlift','leg-curl',2),
  ('romanian-deadlift','leg-curl',1), ('romanian-deadlift','hip-thrust',2),
  ('barbell-row','seated-cable-row',1), ('barbell-row','db-row',2),
  ('overhead-press','lateral-raise',1),
  ('bench-press','incline-db-press',1), ('bench-press','push-up',2),
  ('dip','triceps-pushdown',1),
  ('db-lunge','leg-press',1),
  ('leg-extension','hip-thrust',1),
  ('skull-crusher','triceps-pushdown',1),
  ('barbell-curl','db-curl',1)
) v(ex, sub, prio)
join exercises a on a.slug = v.ex
join exercises b on b.slug = v.sub;

alter table exercise_substitutes enable row level security;
create policy read_catalog on exercise_substitutes for select to authenticated using (true);

-- Inputs del armador en el perfil del usuario
alter table user_settings
  add column minutes_per_session int check (minutes_per_session between 20 and 180),
  add column injured_joints text[] not null default '{}'
    check (injured_joints <@ array['rodilla','cadera','lumbar','hombro','codo','muneca','tobillo','cuello']);

-- =====================================================================
-- 2. REGLAS DEL ARMADOR
-- =====================================================================
create table builder_goal_rules (
  goal                 text primary key check (goal in ('perder_grasa','ganar_masa','recomposicion','fuerza')),
  name                 text not null,
  method_goal          text not null,          -- se cruza con methods.goals
  compound_reps_min    int  not null,
  compound_reps_max    int  not null,
  isolation_reps_min   int  not null,
  isolation_reps_max   int  not null,
  rir_min              int  not null,
  rir_max              int  not null,
  isolation_rir_min    int  not null,
  isolation_rir_max    int  not null,
  sets_week_min        int  not null,          -- series por músculo por semana (principiante)
  sets_week_max        int  not null,          -- (avanzado)
  cardio_z2_min_week   int  not null,
  cardio_z2_max_week   int  not null,
  steps_target         int,
  hiit_per_week        int  not null default 0,
  no_hiit_before_legs  boolean not null default false,
  sec_per_set          int  not null default 165, -- tope de series según minutos por sesión
  updated_at           timestamptz not null default now()
);

insert into builder_goal_rules values
('perder_grasa','Perder grasa','hipertrofia', 6,10, 10,15, 1,3, 1,3, 10,14, 150,300, 9000, 1, false, 165, now()),
('ganar_masa',  'Ganar masa',  'hipertrofia', 6,12, 10,20, 0,2, 0,1, 12,20,  60, 90, null, 0, false, 165, now()),
('recomposicion','Recomposición','hipertrofia',6,12,  6,12, 1,2, 1,2, 10,16,  90,150, 8000, 0, false, 165, now()),
('fuerza',      'Fuerza',      'fuerza',      1, 6,  6,10, 1,3, 1,3,  8,12,  60, 60, null, 0, true,  180, now());

alter table builder_goal_rules enable row level security;
create policy read_catalog on builder_goal_rules for select to authenticated using (true);
create trigger trg_builder_goal_rules_updated before update on builder_goal_rules
  for each row execute function set_updated_at();

-- =====================================================================
-- 3. NUTRICIÓN
-- =====================================================================

-- Alimentos: cache de Open Food Facts + alimentos propios. Por usuario (sync offline por bucket).
create table foods (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users on delete cascade,
  source          text not null check (source in ('off','custom')),
  barcode         text,
  name            text not null,
  brand           text,
  kcal_100g       numeric(6,1) not null check (kcal_100g >= 0),
  protein_100g    numeric(5,1) not null default 0,
  carbs_100g      numeric(5,1) not null default 0,
  fat_100g        numeric(5,1) not null default 0,
  fiber_100g      numeric(5,1),
  serving_g       numeric(6,1),
  serving_label   text,                    -- '1 unidad', '1 taza'
  image_url       text,
  off_updated_at  timestamptz,
  is_favorite     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (owner_id, barcode)
);
create index foods_owner_name_idx on foods (owner_id, name);

create table nutrition_profiles (
  user_id          uuid primary key references auth.users on delete cascade,
  sex              text not null check (sex in ('masculino','femenino')), -- requerido por Mifflin-St Jeor
  birth_date       date not null,
  height_cm        numeric(5,1) not null check (height_cm between 120 and 230),
  activity_factor  numeric(4,3) not null default 1.375
                   check (activity_factor between 1.2 and 1.9),
  goal             text not null check (goal in ('perder_grasa','ganar_masa','recomposicion','fuerza')),
  rate_kg_week     numeric(4,2) not null default 0,  -- negativo = bajar (ej. -0.5)
  protein_g_kg     numeric(3,1) not null default 2.0 check (protein_g_kg between 1.2 and 3.0),
  fat_pct_kcal     numeric(3,2) not null default 0.25 check (fat_pct_kcal between 0.15 and 0.40),
  auto_adjust      boolean not null default true,
  updated_at       timestamptz not null default now()
);

create table nutrition_targets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  valid_from   date not null,
  bmr          int  not null,
  tdee         int  not null,
  kcal         int  not null check (kcal >= 1000),
  protein_g    int  not null,
  carbs_g      int  not null,
  fat_g        int  not null,
  reason       text not null check (reason in ('inicial','ajuste_semanal','manual')),
  checkin_id   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index on nutrition_targets (user_id, valid_from desc);

create table food_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  log_date    date not null,
  meal        text not null check (meal in ('desayuno','almuerzo','merienda','cena','snack')),
  food_id     uuid references foods on delete set null,
  food_name   text not null,                 -- snapshot por si se borra el alimento
  grams       numeric(6,1) not null check (grams > 0),
  kcal        numeric(6,1) not null,         -- snapshot calculado al registrar
  protein_g   numeric(5,1) not null,
  carbs_g     numeric(5,1) not null,
  fat_g       numeric(5,1) not null,
  logged_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index on food_logs (user_id, log_date);

create table weekly_checkins (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users on delete cascade,
  week_start          date not null,
  avg_weight_kg       numeric(5,2),          -- promedio 7 días desde body_measurements
  change_kg           numeric(4,2),          -- vs semana anterior
  target_change_kg    numeric(4,2),          -- = rate_kg_week vigente
  avg_kcal_logged     int,
  days_logged         int not null default 0,
  adherence_pct       int,                   -- días registrados / 7
  adjustment_kcal     int not null default 0,
  applied             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  unique (user_id, week_start)
);

alter table nutrition_targets
  add constraint nutrition_targets_checkin_fk foreign key (checkin_id) references weekly_checkins on delete set null;

-- Resumen diario (lo usa la pantalla del contador)
create view v_daily_nutrition with (security_invoker = true) as
select user_id, log_date,
       round(sum(kcal))      as kcal,
       round(sum(protein_g)) as protein_g,
       round(sum(carbs_g))   as carbs_g,
       round(sum(fat_g))     as fat_g,
       count(*)              as items
from food_logs
where deleted_at is null
group by user_id, log_date;

-- RLS + triggers
do $$
declare t text;
begin
  foreach t in array array['nutrition_profiles','nutrition_targets','food_logs','weekly_checkins'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy own_rows on %I for all to authenticated
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
  foreach t in array array['foods','nutrition_profiles','nutrition_targets','food_logs','weekly_checkins'] loop
    execute format('create trigger trg_%1$s_updated before update on %1$I
                    for each row execute function set_updated_at()', t);
  end loop;
end $$;

alter table foods enable row level security;
create policy own_foods on foods for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

commit;
