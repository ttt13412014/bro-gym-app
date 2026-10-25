-- Bro? · 007 — e1RM: con 1 rep efectiva (1 rep a RIR 0) el 1RM es el peso; solo series principales de 1-12 reps
-- Postgres 16 no permite cambiar la expresión de una columna generada: se borra y se recrea.
begin;
alter table workout_sets drop column e1rm_kg;
alter table workout_sets add column e1rm_kg numeric(6,1) generated always as (
  case when weight_kg > 0 and reps between 1 and 12 and rep_unit = 'reps'
            and set_type <> 'warmup' and parent_set_id is null
       then round(case when reps + coalesce(rir, 10 - rpe, 0) <= 1 then weight_kg
                       else weight_kg * (1 + (reps + coalesce(rir, 10 - rpe, 0)) / 30.0) end, 1)
  end) stored;
commit;
