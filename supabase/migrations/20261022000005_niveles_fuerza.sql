-- =====================================================================
-- Bro? · 005 — niveles de fuerza (banca, sentadilla, peso muerto)
-- =====================================================================
begin;

-- Niveles: slug fijo, nombre e ícono editables
create table strength_levels (
  slug        text primary key check (slug in ('bajo','medio','alto')),
  rank        int  not null unique check (rank between 1 and 3),
  name        text not null,
  icon        text not null check (icon in ('fideo','estrella','mandibula')),
  uses_accent boolean not null default false,   -- solo el nivel alto va en naranja
  updated_at  timestamptz not null default now()
);

insert into strength_levels (slug, rank, name, icon, uses_accent) values
  ('bajo',  1, 'Muy pete', 'fideo',     false),
  ('medio', 2, 'Intermedio','estrella',  false),
  ('alto',  3, 'Chad',     'mandibula', true);

-- Umbrales: múltiplo del peso corporal para ENTRAR al nivel (bajo = todo lo de abajo).
-- Ajuste por altura: requerido × (1 − height_adj_per_cm × (altura − ref)), acotado a ± height_adj_max.
create table strength_standards (
  id                uuid primary key default gen_random_uuid(),
  lift              text not null check (lift in ('bench','squat','deadlift')),
  exercise_id       uuid not null references exercises,
  sex               text not null check (sex in ('masculino','femenino')),
  level_slug        text not null references strength_levels (slug),
  bw_multiple       numeric(4,2) not null check (bw_multiple > 0),
  ref_height_cm     numeric(5,1) not null,
  height_adj_per_cm numeric(5,4) not null default 0.0025,
  height_adj_max    numeric(3,2) not null default 0.05,
  updated_at        timestamptz not null default now(),
  unique (lift, sex, level_slug)
);

insert into strength_standards (lift, exercise_id, sex, level_slug, bw_multiple, ref_height_cm)
select v.lift, e.id, v.sex, v.lvl, v.mult, v.ref
from (values
  ('bench',    'bench-press', 'masculino', 'medio', 1.00, 175),
  ('bench',    'bench-press', 'masculino', 'alto',  1.40, 175),
  ('squat',    'back-squat',  'masculino', 'medio', 1.40, 175),
  ('squat',    'back-squat',  'masculino', 'alto',  1.75, 175),
  ('deadlift', 'deadlift',    'masculino', 'medio', 1.75, 175),
  ('deadlift', 'deadlift',    'masculino', 'alto',  2.15, 175),
  ('bench',    'bench-press', 'femenino',  'medio', 0.60, 162),
  ('bench',    'bench-press', 'femenino',  'alto',  0.85, 162),
  ('squat',    'back-squat',  'femenino',  'medio', 1.10, 162),
  ('squat',    'back-squat',  'femenino',  'alto',  1.40, 162),
  ('deadlift', 'deadlift',    'femenino',  'medio', 1.30, 162),
  ('deadlift', 'deadlift',    'femenino',  'alto',  1.70, 162)
) v(lift, slug, sex, lvl, mult, ref)
join exercises e on e.slug = v.slug and e.owner_id is null;

-- Nivel calculado por usuario: una fila por lift + 'general'
create table user_strength_levels (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  lift            text not null check (lift in ('bench','squat','deadlift','general')),
  level_slug      text not null references strength_levels (slug),
  best_e1rm_kg    numeric(6,1),
  bodyweight_kg   numeric(5,2),
  ratio           numeric(4,2),            -- e1RM / peso corporal
  next_level_slug text references strength_levels (slug),
  kg_to_next      numeric(6,1),            -- null si ya está en el nivel alto
  computed_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (user_id, lift)
);

-- Nombre visible + nivel general (el ícono cambia solo cuando cambia este valor)
alter table user_settings
  add column display_name text check (char_length(display_name) between 1 and 40),
  add column strength_level text references strength_levels (slug),
  add column strength_level_since timestamptz;

-- RLS
alter table strength_levels enable row level security;
create policy read_catalog on strength_levels for select to authenticated using (true);
alter table strength_standards enable row level security;
create policy read_catalog on strength_standards for select to authenticated using (true);
alter table user_strength_levels enable row level security;
create policy own_rows on user_strength_levels for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger trg_strength_levels_updated before update on strength_levels
  for each row execute function set_updated_at();
create trigger trg_strength_standards_updated before update on strength_standards
  for each row execute function set_updated_at();
create trigger trg_user_strength_levels_updated before update on user_strength_levels
  for each row execute function set_updated_at();

alter publication powersync add table strength_levels, strength_standards, user_strength_levels;

commit;
