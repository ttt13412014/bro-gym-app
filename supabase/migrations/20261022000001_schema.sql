-- =====================================================================
-- Bro? · 001_schema.sql
-- Biblioteca de métodos + rutinas de usuario + registro + mesociclos
-- Postgres / Supabase
-- =====================================================================
create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================
-- CATÁLOGO (global, solo lectura para usuarios)
-- =====================================================================

-- Ejercicios. Base: free-exercise-db (github.com/yuhonas/free-exercise-db)
-- OJO: free-exercise-db NO trae GIFs, trae 2 JPG por ejercicio (inicio/fin).
-- Se guardan las rutas en images[] y se animan con crossfade en la app.
-- URL final: https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<images[i]>
create table exercises (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  source            text not null default 'free-exercise-db'
                    check (source in ('free-exercise-db','custom')),
  source_id         text unique,                 -- id en free-exercise-db (ej. 'Barbell_Squat')
  name              text not null,               -- nombre original (inglés)
  name_es           text not null,
  category          text default 'strength',     -- strength | stretching | cardio | plyometrics ...
  mechanic          text check (mechanic in ('compound','isolation')),
  force             text check (force in ('push','pull','static')),
  level             text,
  equipment         text,                        -- barbell | dumbbell | cable | machine | body only ...
  primary_muscles   text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  images            text[] not null default '{}',
  gif_url           text,                        -- opcional (animación propia)
  instructions      text[] not null default '{}',
  owner_id          uuid references auth.users on delete cascade, -- null = global; no null = ejercicio custom
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index exercises_primary_idx on exercises using gin (primary_muscles);
create index exercises_owner_idx   on exercises (owner_id);

create table methods (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  name                text not null,
  creator             text,
  summary             text not null,             -- qué es
  target              text not null,             -- para quién sirve
  category            text not null check (category in ('alta_intensidad','fuerza','hibrido','otros')),
  goals               text[] not null,           -- {'fuerza','hipertrofia','resistencia'}
  level               text not null check (level in ('principiante','intermedio','avanzado')),
  days_min            int  not null check (days_min between 1 and 7),
  days_max            int  not null check (days_max between days_min and 7),
  equipment           text[] not null default '{}',
  sets_reps_rest      text,                      -- resumen para la ficha
  intensity_summary   text,                      -- resumen RIR/RPE/%1RM para la ficha
  recovery_days_min   int  not null default 0,   -- días de descanso mínimos entre 2 sesiones
  requires_one_rm     boolean not null default false,  -- 5/3/1, GVT: pide 1RM/TM antes de cargar
  default_progression jsonb not null,            -- Zod: Progression (ver progression.ts)
  rules               jsonb not null default '{}', -- reglas propias del método (Zod por slug)
  volume_score        int check (volume_score    between 1 and 10),
  intensity_score     int check (intensity_score between 1 and 10),
  frequency_score     int check (frequency_score between 1 and 10),
  is_published        boolean not null default true,
  version             int not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table techniques (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  description   text not null,
  params_schema jsonb not null default '{}',
  is_public     boolean not null default true,   -- false = técnica interna de un método (ej. fst7-finisher)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Un template = un día del método
create table method_templates (
  id         uuid primary key default gen_random_uuid(),
  method_id  uuid not null references methods on delete cascade,
  day_index  int  not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (method_id, day_index)
);

create table template_blocks (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null references method_templates on delete cascade,
  position         int  not null,
  exercise_id      uuid not null references exercises,
  set_type         text not null default 'working',
  sets             int  not null check (sets between 1 and 20),
  reps_min         int  not null,
  reps_max         int  not null check (reps_max >= reps_min),
  rep_unit         text not null default 'reps' check (rep_unit in ('reps','sec')),
  rest_sec         int  not null default 90,
  tempo            text,                         -- '4-0-2-0' (exc-pausa-conc-pausa)
  intensity        jsonb not null default '{"type":"rir","value":2}',
  technique_id     uuid references techniques,
  technique_params jsonb,
  group_key        text,                         -- misma letra en el día = superserie/biserie
  progression      jsonb,                        -- OVERRIDE; null = usa default_progression del método
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (template_id, position)
);

-- =====================================================================
-- DATOS DEL USUARIO (todas con user_id para RLS y buckets de sync)
-- =====================================================================

create table user_settings (
  user_id            uuid primary key references auth.users on delete cascade,
  weight_unit        text not null default 'kg' check (weight_unit in ('kg','lb')),
  increment_kg       numeric(4,2) not null default 2.5,   -- salto mínimo con barra
  increment_db_kg    numeric(4,2) not null default 2,     -- salto mínimo con mancuernas
  goal               text,
  experience         text,
  days_available     int,
  equipment          text[] not null default '{}',
  updated_at         timestamptz not null default now()
);

-- 1RM y training max por ejercicio. Historial: una fila por medición.
create table user_exercise_maxes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  exercise_id     uuid not null references exercises,
  one_rm_kg       numeric(6,2),
  training_max_kg numeric(6,2),
  source          text not null check (source in ('test','estimado','manual','ciclo_531')),
  measured_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index on user_exercise_maxes (user_id, exercise_id, measured_at desc);

create view v_current_maxes with (security_invoker = true) as
select distinct on (user_id, exercise_id)
       user_id, exercise_id, one_rm_kg, training_max_kg, source, measured_at
from user_exercise_maxes
where deleted_at is null
order by user_id, exercise_id, measured_at desc;

create table user_routines (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users on delete cascade,
  method_id             uuid references methods,
  name                  text not null,
  progression           jsonb not null,        -- copiado de methods.default_progression
  rules                 jsonb not null default '{}',
  recovery_days_min     int not null default 0,
  source_method_version int,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create table user_routine_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  routine_id uuid not null references user_routines on delete cascade,
  day_index  int  not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table user_routine_blocks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  routine_day_id   uuid not null references user_routine_days on delete cascade,
  source_block_id  uuid references template_blocks on delete set null,
  position         int  not null,
  exercise_id      uuid not null references exercises,
  set_type         text not null default 'working',
  sets             int  not null check (sets between 1 and 20),
  reps_min         int  not null,
  reps_max         int  not null check (reps_max >= reps_min),
  rep_unit         text not null default 'reps' check (rep_unit in ('reps','sec')),
  rest_sec         int  not null default 90,
  tempo            text,
  intensity        jsonb not null,
  technique_id     uuid references techniques,
  technique_params jsonb,
  group_key        text,
  progression      jsonb,                       -- override; null = user_routines.progression
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index on user_routine_blocks (routine_day_id, position);

-- Mesociclos / planes
create table plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  routine_id uuid not null references user_routines on delete cascade,
  name       text not null,
  start_date date not null,
  weeks      int  not null check (weeks between 1 and 16),
  status     text not null default 'activo' check (status in ('activo','pausado','terminado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table plan_weeks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  plan_id        uuid not null references plans on delete cascade,
  week_index     int  not null,
  kind           text not null default 'acumulacion'
                 check (kind in ('acumulacion','intensificacion','deload','test')),
  volume_mult    numeric(3,2) not null default 1,    -- deload típico: 0.5
  intensity_mult numeric(3,2) not null default 1,    -- deload típico: 0.9
  rir_offset     int not null default 0,             -- deload típico: +2
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (plan_id, week_index)
);

-- Estado del motor por bloque (cache: se puede recalcular desde workout_sets)
create table user_progression_state (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  routine_block_id uuid not null unique references user_routine_blocks on delete cascade,
  next_weight_kg   numeric(6,2),
  next_reps        int,
  wave_week        int check (wave_week between 1 and 4),  -- 5/3/1
  fail_streak      int not null default 0,
  last_session_id  uuid,
  updated_at       timestamptz not null default now()
);

create table workout_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  routine_id     uuid references user_routines on delete set null,
  routine_day_id uuid references user_routine_days on delete set null,
  plan_week_id   uuid references plan_weeks on delete set null,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  bodyweight_kg  numeric(5,2),
  session_rpe    numeric(3,1) check (session_rpe between 1 and 10),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index on workout_sessions (user_id, started_at desc);

create table workout_sets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  session_id       uuid not null references workout_sessions on delete cascade,
  exercise_id      uuid not null references exercises,
  routine_block_id uuid references user_routine_blocks on delete set null, -- bloque que se estaba cumpliendo
  set_index        int  not null,
  set_type         text not null default 'working' check (set_type in
                   ('warmup','working','top','backoff','amrap','failure','drop',
                    'rest_pause','myo','cluster','negative','partial','forced')),
  parent_set_id    uuid references workout_sets on delete cascade,  -- cadena de drop/rest-pause/myo
  weight_kg        numeric(6,2),
  reps             int check (reps >= 0),
  rep_unit         text not null default 'reps' check (rep_unit in ('reps','sec')),
  rir              int check (rir between 0 and 10),
  rpe              numeric(3,1) check (rpe between 1 and 10),
  tempo            text,
  rest_sec_target  int,
  rest_sec_actual  int,
  target           jsonb,               -- snapshot de lo prescripto: {"weight_kg":100,"reps":5,"rir":2}
  completed_at     timestamptz not null default now(),
  e1rm_kg          numeric(6,1) generated always as (
                     case when weight_kg > 0 and reps between 1 and 12 and rep_unit = 'reps'
                          then round(weight_kg * (1 + (reps + coalesce(rir, 10 - rpe, 0)) / 30.0), 1)
                     end) stored,     -- Epley ajustado por RIR (RPE -> RIR = 10 - RPE)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index on workout_sets (session_id, set_index);
create index on workout_sets (routine_block_id, completed_at desc);
create index on workout_sets (user_id, exercise_id, completed_at desc);

create table body_measurements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  measured_at  timestamptz not null default now(),
  weight_kg    numeric(5,2),
  body_fat_pct numeric(4,1),
  neck_cm      numeric(5,1),
  chest_cm     numeric(5,1),
  waist_cm     numeric(5,1),
  hip_cm       numeric(5,1),
  arm_cm       numeric(5,1),
  thigh_cm     numeric(5,1),
  calf_cm      numeric(5,1),
  photo_path   text,                    -- Supabase Storage
  notes        text,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index on body_measurements (user_id, measured_at desc);

-- =====================================================================
-- TRIGGERS updated_at + RLS
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'exercises','methods','techniques','method_templates','template_blocks',
    'user_settings','user_exercise_maxes','user_routines','user_routine_days',
    'user_routine_blocks','plans','plan_weeks','user_progression_state',
    'workout_sessions','workout_sets','body_measurements'] loop
    execute format('create trigger trg_%1$s_updated before update on %1$I
                    for each row execute function set_updated_at()', t);
  end loop;

  foreach t in array array[
    'user_settings','user_exercise_maxes','user_routines','user_routine_days',
    'user_routine_blocks','plans','plan_weeks','user_progression_state',
    'workout_sessions','workout_sets','body_measurements'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy own_rows on %I for all to authenticated
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;

  foreach t in array array['methods','techniques','method_templates','template_blocks'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy read_catalog on %I for select to authenticated using (true)', t);
  end loop;
end $$;

alter table exercises enable row level security;
create policy read_exercises on exercises for select to authenticated
  using (owner_id is null or owner_id = auth.uid());
create policy write_own_exercises on exercises for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and source = 'custom');

-- =====================================================================
-- Cargar método -> rutina del usuario (versión online / web).
-- Offline, el cliente hace la misma copia en su SQLite local.
-- =====================================================================
create or replace function clone_method_to_routine(p_method_slug text, p_name text default null)
returns uuid
language plpgsql security invoker as $$
declare
  m        methods;
  r_id     uuid;
  d        record;
  new_day  uuid;
begin
  select * into m from methods where slug = p_method_slug and is_published;
  if not found then raise exception 'Método % no existe', p_method_slug; end if;

  insert into user_routines (user_id, method_id, name, progression, rules, recovery_days_min, source_method_version)
  values (auth.uid(), m.id, coalesce(p_name, m.name), m.default_progression, m.rules, m.recovery_days_min, m.version)
  returning id into r_id;

  for d in select * from method_templates where method_id = m.id order by day_index loop
    insert into user_routine_days (user_id, routine_id, day_index, name)
    values (auth.uid(), r_id, d.day_index, d.name)
    returning id into new_day;

    insert into user_routine_blocks (
      user_id, routine_day_id, source_block_id, position, exercise_id, set_type, sets,
      reps_min, reps_max, rep_unit, rest_sec, tempo, intensity, technique_id,
      technique_params, group_key, progression, notes)
    select auth.uid(), new_day, b.id, b.position, b.exercise_id, b.set_type, b.sets,
           b.reps_min, b.reps_max, b.rep_unit, b.rest_sec, b.tempo, b.intensity, b.technique_id,
           b.technique_params, b.group_key, b.progression, b.notes
    from template_blocks b where b.template_id = d.id;
  end loop;

  return r_id;
end $$;
