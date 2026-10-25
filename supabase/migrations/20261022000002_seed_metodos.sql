-- =====================================================================
-- Bro? · 002_seed_metodos.sql
-- 48 ejercicios base + 7 técnicas (6 públicas + 1 interna) + 12 métodos con rutinas
-- Idempotente: borra y recrea los métodos de este seed.
-- Los ejercicios quedan con source_id = null: el importador de free-exercise-db
-- los matchea por `name` y completa source_id, images e instructions.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- EJERCICIOS
-- ---------------------------------------------------------------------
insert into exercises (slug, name, name_es, mechanic, force, equipment, primary_muscles, secondary_muscles) values
('back-squat','Barbell Squat','Sentadilla con barra','compound','push','barbell','{quadriceps}','{glutes,hamstrings,"lower back"}'),
('front-squat','Front Barbell Squat','Sentadilla frontal','compound','push','barbell','{quadriceps}','{glutes,abdominals}'),
('deadlift','Barbell Deadlift','Peso muerto','compound','pull','barbell','{"lower back"}','{hamstrings,glutes,quadriceps,traps}'),
('romanian-deadlift','Romanian Deadlift','Peso muerto rumano','compound','pull','barbell','{hamstrings}','{glutes,"lower back"}'),
('bench-press','Barbell Bench Press - Medium Grip','Press de banca','compound','push','barbell','{chest}','{triceps,shoulders}'),
('incline-bench-press','Barbell Incline Bench Press - Medium Grip','Press inclinado con barra','compound','push','barbell','{chest}','{shoulders,triceps}'),
('incline-db-press','Incline Dumbbell Press','Press inclinado con mancuernas','compound','push','dumbbell','{chest}','{shoulders,triceps}'),
('close-grip-bench','Close-Grip Barbell Bench Press','Press de banca agarre cerrado','compound','push','barbell','{triceps}','{chest,shoulders}'),
('overhead-press','Standing Military Press','Press militar','compound','push','barbell','{shoulders}','{triceps}'),
('db-shoulder-press','Dumbbell Shoulder Press','Press de hombros con mancuernas','compound','push','dumbbell','{shoulders}','{triceps}'),
('arnold-press','Arnold Dumbbell Press','Press Arnold','compound','push','dumbbell','{shoulders}','{triceps}'),
('barbell-row','Bent Over Barbell Row','Remo con barra','compound','pull','barbell','{"middle back"}','{lats,biceps,"lower back"}'),
('db-row','One-Arm Dumbbell Row','Remo a una mano con mancuerna','compound','pull','dumbbell','{"middle back"}','{lats,biceps}'),
('seated-cable-row','Seated Cable Rows','Remo sentado en polea','compound','pull','cable','{"middle back"}','{lats,biceps}'),
('pull-up','Pullups','Dominadas','compound','pull','body only','{lats}','{biceps,"middle back"}'),
('chin-up','Chin-Up','Dominadas supinas','compound','pull','body only','{lats}','{biceps}'),
('lat-pulldown','Wide-Grip Lat Pulldown','Jalón al pecho','compound','pull','cable','{lats}','{biceps,"middle back"}'),
('close-grip-pulldown','Close-Grip Front Lat Pulldown','Jalón agarre cerrado','compound','pull','cable','{lats}','{biceps}'),
('pullover','Straight-Arm Dumbbell Pullover','Pullover con mancuerna','isolation','pull','dumbbell','{lats}','{chest,triceps}'),
('inverted-row','Inverted Row','Remo invertido','compound','pull','body only','{"middle back"}','{lats,biceps}'),
('dip','Dips - Chest Version','Fondos en paralelas','compound','push','body only','{chest}','{triceps,shoulders}'),
('push-up','Pushups','Flexiones de brazos','compound','push','body only','{chest}','{triceps,shoulders}'),
('pike-push-up','Pike Push-Up','Flexiones pike','compound','push','body only','{shoulders}','{triceps}'),
('leg-press','Leg Press','Prensa de piernas','compound','push','machine','{quadriceps}','{glutes,hamstrings}'),
('leg-extension','Leg Extensions','Extensión de cuádriceps','isolation','push','machine','{quadriceps}','{}'),
('leg-curl','Lying Leg Curls','Curl femoral acostado','isolation','pull','machine','{hamstrings}','{}'),
('db-lunge','Dumbbell Lunges','Estocadas con mancuernas','compound','push','dumbbell','{quadriceps}','{glutes,hamstrings}'),
('bw-lunge','Bodyweight Walking Lunge','Estocadas sin peso','compound','push','body only','{quadriceps}','{glutes,hamstrings}'),
('bw-squat','Bodyweight Squat','Sentadilla sin peso','compound','push','body only','{quadriceps}','{glutes}'),
('hip-thrust','Barbell Hip Thrust','Hip thrust con barra','compound','push','barbell','{glutes}','{hamstrings}'),
('glute-bridge','Butt Lift (Bridge)','Puente de glúteos','isolation','push','body only','{glutes}','{hamstrings}'),
('calf-raise','Standing Calf Raises','Elevación de talones de pie','isolation','push','machine','{calves}','{}'),
('lateral-raise','Side Lateral Raise','Elevaciones laterales','isolation','push','dumbbell','{shoulders}','{}'),
('rear-delt-fly','Reverse Flyes','Vuelos posteriores','isolation','pull','dumbbell','{shoulders}','{"middle back"}'),
('face-pull','Face Pull','Face pull','isolation','pull','cable','{shoulders}','{"middle back",traps}'),
('shrug','Barbell Shrug','Encogimientos con barra','isolation','pull','barbell','{traps}','{}'),
('db-fly','Dumbbell Flyes','Aperturas con mancuernas','isolation','push','dumbbell','{chest}','{shoulders}'),
('cable-fly','Cable Crossover','Cruce de poleas','isolation','push','cable','{chest}','{shoulders}'),
('pec-deck','Butterfly','Peck deck','isolation','push','machine','{chest}','{shoulders}'),
('barbell-curl','Barbell Curl','Curl con barra','isolation','pull','barbell','{biceps}','{forearms}'),
('db-curl','Dumbbell Bicep Curl','Curl con mancuernas','isolation','pull','dumbbell','{biceps}','{forearms}'),
('hammer-curl','Hammer Curls','Curl martillo','isolation','pull','dumbbell','{biceps}','{forearms}'),
('preacher-curl','Preacher Curl','Curl predicador','isolation','pull','barbell','{biceps}','{}'),
('triceps-pushdown','Triceps Pushdown','Extensión de tríceps en polea','isolation','push','cable','{triceps}','{}'),
('skull-crusher','EZ-Bar Skullcrusher','Rompecráneos','isolation','push','e-z curl bar','{triceps}','{}'),
('overhead-triceps-ext','Cable Rope Overhead Triceps Extension','Extensión de tríceps sobre la cabeza','isolation','push','cable','{triceps}','{}'),
('hanging-leg-raise','Hanging Leg Raise','Elevación de piernas colgado','isolation','pull','body only','{abdominals}','{}'),
('plank','Plank','Plancha','isolation','static','body only','{abdominals}','{}')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- TÉCNICAS
-- ---------------------------------------------------------------------
insert into techniques (slug, name, description, params_schema, is_public) values
('rest-pause','Rest-pause','Llegás al fallo, descansás 10-20 s y sacás reps extra, 1-3 veces.','{"mini_sets":"int","rest_sec":"int"}',true),
('drop-set','Drop set','Al fallo bajás 20-30% el peso y seguís sin descanso.','{"drops":"int","drop_pct":"number"}',true),
('superserie','Superserie / biserie','Dos ejercicios seguidos sin descanso. Se agrupan con el mismo group_key.','{}',true),
('myo-reps','Myo-reps','Serie de activación (12-20 reps a RIR 1) + mini series de 3-5 reps con 3-5 respiraciones de pausa.','{"activation_reps":"int","mini_reps":"int","mini_sets":"int"}',true),
('piramide','Pirámide','Subís el peso y bajás las reps serie a serie.','{"reps":"int[]"}',true),
('negativas','Negativas','Fase excéntrica lenta (3-5 s); la concéntrica con ayuda o salto.','{"eccentric_sec":"int"}',true),
('fst7-finisher','FST-7 finisher','7 series de 8-12 con 30-45 s de descanso como último ejercicio del músculo.','{"rest_sec":"int[]"}',false)
on conflict (slug) do update set description = excluded.description, params_schema = excluded.params_schema;

-- ---------------------------------------------------------------------
-- MÉTODOS
-- ---------------------------------------------------------------------
delete from methods where slug in ('full-body','torso-pierna','ppl','stronglifts-5x5','531','phul',
  'gvt','heavy-duty','fst-7','arnold-split','bro-split','calistenia-base');

insert into methods (slug,name,creator,summary,target,category,goals,level,days_min,days_max,equipment,
  sets_reps_rest,intensity_summary,recovery_days_min,requires_one_rm,default_progression,rules,
  volume_score,intensity_score,frequency_score) values
('full-body','Full body',null,
 'Todo el cuerpo en cada sesión, alternando dos días A/B. Alta frecuencia por músculo con volumen moderado.',
 'Principiantes o gente con poco tiempo (3 días).','hibrido','{hipertrofia,fuerza}','principiante',2,3,
 '{barbell,dumbbell,cable,machine}','2-3 series de 6-15, descanso 1-3 min','RIR 2',1,false,
 '{"kind":"double","inc_kg":2.5}','{"alternate_days":true}',4,5,8),

('torso-pierna','Torso / pierna',null,
 'Cuatro días: dos de torso y dos de pierna. Cada músculo se entrena 2 veces por semana.',
 'Intermedios que quieren equilibrio entre fuerza e hipertrofia.','hibrido','{hipertrofia,fuerza}','intermedio',4,4,
 '{barbell,dumbbell,cable,machine}','3-4 series de 6-15, descanso 1-3 min','RIR 1-2',0,false,
 '{"kind":"double","inc_kg":2.5}','{}',6,6,6),

('ppl','Push / pull / legs',null,
 'Empuje, tracción y pierna. Se hace 1 vuelta (3 días) o 2 vueltas (6 días) por semana.',
 'Intermedios; escala bien según los días disponibles.','hibrido','{hipertrofia}','intermedio',3,6,
 '{barbell,dumbbell,cable,machine}','3-4 series de 6-15, descanso 1-2,5 min','RIR 1-2',0,false,
 '{"kind":"double","inc_kg":2.5}','{"rotation":"PPL"}',7,6,6),

('stronglifts-5x5','StrongLifts 5x5','Mehdi Hadim',
 'Dos días A/B con los básicos a 5x5. Se sube el peso cada sesión que completás todas las reps.',
 'Principiantes que quieren ganar fuerza rápido con barra.','fuerza','{fuerza}','principiante',3,3,
 '{barbell}','5x5 (peso muerto 1x5), descanso 3-5 min','Peso fijo por sesión; progresión lineal',1,false,
 '{"kind":"linear","inc_kg":2.5,"fail_limit":3,"deload_pct":0.1}','{"alternate_days":true}',3,7,8),

('531','5/3/1','Jim Wendler',
 'Ciclos de 4 semanas sobre un training max (90% del 1RM): 5s, 3s, 5/3/1 y deload. La última serie es AMRAP. Accesorios a gusto (acá, Boring But Big).',
 'Intermedios que buscan fuerza sostenida a largo plazo.','fuerza','{fuerza,hipertrofia}','intermedio',3,4,
 '{barbell,dumbbell,machine}','3 series principales + 5x10 al 50% TM, descanso 2-3 min','% del training max (65-95%)',0,true,
 '{"kind":"double","inc_kg":2.5}','{"requires_training_max":true,"amrap_last_set":true,"cycle_weeks":4}',5,7,5),

('phul','PHUL','Brandon Campbell',
 'Power Hypertrophy Upper Lower: dos días de fuerza pesados (3-5 reps) y dos de hipertrofia (8-15).',
 'Intermedios que quieren fuerza y tamaño en 4 días.','hibrido','{fuerza,hipertrofia}','intermedio',4,4,
 '{barbell,dumbbell,cable,machine}','Fuerza 3x3-5 / hipertrofia 3x8-15','RPE 8 en fuerza, RIR 1-2 en hipertrofia',0,false,
 '{"kind":"double","inc_kg":2.5}','{}',6,7,6),

('gvt','German Volume Training','Vince Gironda / Charles Poliquin',
 '10 series de 10 reps al 60% del 1RM en un ejercicio por músculo, en superserie con su antagonista. Volumen extremo.',
 'Intermedios/avanzados que buscan un bloque corto de hipertrofia (4-6 semanas).','hibrido','{hipertrofia}','avanzado',3,4,
 '{barbell,dumbbell,machine}','10x10 con 60-90 s de descanso + 2 accesorios 3x10-12','60% 1RM, tempo 4-0-2-0',1,true,
 '{"kind":"fixed_pct","pct":0.6,"inc_kg":2.5,"require_all_sets":true}',
 '{"main_sets":10,"main_reps":10,"tempo":"4-0-2-0","max_weeks":6}',10,4,4),

('heavy-duty','Heavy Duty','Mike Mentzer',
 '1-2 series efectivas al fallo absoluto por ejercicio, con pre-agotamiento y técnicas como rest-pause. Muy poco volumen y mucha recuperación.',
 'Avanzados con buena técnica que toleran entrenar al fallo.','alta_intensidad','{hipertrofia,fuerza}','avanzado',2,3,
 '{barbell,dumbbell,cable,machine}','1 serie de 6-10 al fallo, 4+ días entre sesiones','RIR 0 (fallo)',4,false,
 '{"kind":"double","inc_kg":2.5,"target_rir":0}',
 '{"to_failure":true,"max_working_sets":2,"warmups_not_to_failure":true}',1,10,2),

('fst-7','FST-7','Hany Rambod',
 'Fascia Stretch Training: el último ejercicio de cada músculo son 7 series con 30-45 s de descanso para máximo bombeo.',
 'Intermedios/avanzados enfocados en hipertrofia y estética.','alta_intensidad','{hipertrofia}','intermedio',5,5,
 '{barbell,dumbbell,cable,machine}','3-4 series de 8-12 + finisher 7x8-12 con 30-45 s','RIR 1',0,false,
 '{"kind":"double","inc_kg":2.5}',
 '{"finisher":{"sets":7,"rest_sec":[30,45],"position":"last_per_muscle"}}',9,7,3),

('arnold-split','Arnold split','Arnold Schwarzenegger',
 'Pecho+espalda, hombros+brazos y pierna, dos veces por semana, con muchas superseries antagonistas.',
 'Avanzados con tiempo y buena recuperación (6 días).','alta_intensidad','{hipertrofia}','avanzado',6,6,
 '{barbell,dumbbell,cable,machine}','3-5 series de 6-15, superseries, descanso 1-1,5 min','RIR 1',0,false,
 '{"kind":"double","inc_kg":2.5}','{"rotation":"ABCABC"}',9,7,7),

('bro-split','Bro split',null,
 'Un grupo muscular por día durante 5 días. Mucho volumen por sesión y baja frecuencia.',
 'Cualquier nivel que disfrute sesiones enfocadas en un músculo.','alta_intensidad','{hipertrofia}','intermedio',5,5,
 '{barbell,dumbbell,cable,machine}','3-4 series de 6-15 por ejercicio, 4-6 ejercicios','RIR 1-2',0,false,
 '{"kind":"double","inc_kg":2.5}','{}',7,6,2),

('calistenia-base','Calistenia base',null,
 'Full body con peso corporal, alternando A/B. Sumás reps y, al llegar al tope, pasás a una variante más difícil.',
 'Principiantes, o entrenar en casa o en una plaza.','otros','{fuerza,hipertrofia,resistencia}','principiante',3,3,
 '{"body only"}','3 series de 6-25, descanso 1-2 min','RIR 2',1,false,
 '{"kind":"reps","inc_reps":1,"next_variant_at_reps_max":true}','{"alternate_days":true}',4,5,7);

-- ---------------------------------------------------------------------
-- HELPERS (temporales de la sesión)
-- ---------------------------------------------------------------------
create or replace function pg_temp.day(p_method text, p_idx int, p_name text) returns void
language sql as $$
  insert into method_templates (method_id, day_index, name)
  select id, p_idx, p_name from methods where slug = p_method;
$$;

create or replace function pg_temp.b(
  p_method text, p_day int, p_ex text, p_sets int, p_rmin int, p_rmax int, p_rest int,
  i     jsonb default '{"type":"rir","value":2}',
  tech  text  default null,
  tp    jsonb default null,
  grp   text  default null,
  prog  jsonb default null,
  stype text  default 'working',
  unit  text  default 'reps',
  tempo text  default null,
  notes text  default null
) returns void language plpgsql as $$
declare t_id uuid; e_id uuid; tq_id uuid; pos int;
begin
  select t.id into t_id from method_templates t join methods m on m.id = t.method_id
   where m.slug = p_method and t.day_index = p_day;
  select id into e_id from exercises where slug = p_ex and owner_id is null;
  if t_id is null or e_id is null then
    raise exception 'Seed roto: % día % ejercicio %', p_method, p_day, p_ex;
  end if;
  if tech is not null then
    select id into tq_id from techniques where slug = tech;
    if tq_id is null then raise exception 'Técnica % no existe', tech; end if;
  end if;
  select coalesce(max(position), 0) + 1 into pos from template_blocks where template_id = t_id;
  insert into template_blocks (template_id, position, exercise_id, set_type, sets, reps_min, reps_max,
    rep_unit, rest_sec, tempo, intensity, technique_id, technique_params, group_key, progression, notes)
  values (t_id, pos, e_id, stype, p_sets, p_rmin, p_rmax, unit, p_rest, tempo, i, tq_id, tp, grp, prog, notes);
end $$;

-- ---------------------------------------------------------------------
-- 1. FULL BODY
-- ---------------------------------------------------------------------
select pg_temp.day('full-body',1,'Full body A');
select pg_temp.b('full-body',1,'back-squat',3,6,10,150);
select pg_temp.b('full-body',1,'bench-press',3,6,10,150);
select pg_temp.b('full-body',1,'barbell-row',3,8,12,120);
select pg_temp.b('full-body',1,'romanian-deadlift',2,8,12,120);
select pg_temp.b('full-body',1,'lateral-raise',2,12,15,60);
select pg_temp.b('full-body',1,'plank',3,30,60,60, i=>'{"type":"none"}', unit=>'sec', prog=>'{"kind":"reps","inc_reps":5}');

select pg_temp.day('full-body',2,'Full body B');
select pg_temp.b('full-body',2,'deadlift',3,5,8,180);
select pg_temp.b('full-body',2,'overhead-press',3,6,10,150);
select pg_temp.b('full-body',2,'lat-pulldown',3,8,12,90);
select pg_temp.b('full-body',2,'leg-press',3,10,15,120);
select pg_temp.b('full-body',2,'db-curl',2,10,15,60);
select pg_temp.b('full-body',2,'triceps-pushdown',2,10,15,60);

-- ---------------------------------------------------------------------
-- 2. TORSO / PIERNA
-- ---------------------------------------------------------------------
select pg_temp.day('torso-pierna',1,'Torso A');
select pg_temp.b('torso-pierna',1,'bench-press',4,6,8,150, i=>'{"type":"rir","value":1}');
select pg_temp.b('torso-pierna',1,'barbell-row',4,6,8,150, i=>'{"type":"rir","value":1}');
select pg_temp.b('torso-pierna',1,'overhead-press',3,8,10,120);
select pg_temp.b('torso-pierna',1,'lat-pulldown',3,10,12,90);
select pg_temp.b('torso-pierna',1,'barbell-curl',2,10,12,60, grp=>'A', tech=>'superserie');
select pg_temp.b('torso-pierna',1,'triceps-pushdown',2,10,12,60, grp=>'A', tech=>'superserie');

select pg_temp.day('torso-pierna',2,'Pierna A');
select pg_temp.b('torso-pierna',2,'back-squat',4,6,8,180, i=>'{"type":"rir","value":1}');
select pg_temp.b('torso-pierna',2,'romanian-deadlift',3,8,10,150);
select pg_temp.b('torso-pierna',2,'leg-press',3,10,12,120);
select pg_temp.b('torso-pierna',2,'leg-curl',3,10,12,75);
select pg_temp.b('torso-pierna',2,'calf-raise',4,10,15,60);

select pg_temp.day('torso-pierna',3,'Torso B');
select pg_temp.b('torso-pierna',3,'incline-db-press',4,8,10,120);
select pg_temp.b('torso-pierna',3,'seated-cable-row',4,8,10,120);
select pg_temp.b('torso-pierna',3,'db-shoulder-press',3,10,12,90);
select pg_temp.b('torso-pierna',3,'pull-up',3,6,10,120);
select pg_temp.b('torso-pierna',3,'lateral-raise',3,12,15,60);
select pg_temp.b('torso-pierna',3,'hammer-curl',2,10,12,60, grp=>'A', tech=>'superserie');
select pg_temp.b('torso-pierna',3,'skull-crusher',2,10,12,60, grp=>'A', tech=>'superserie');

select pg_temp.day('torso-pierna',4,'Pierna B');
select pg_temp.b('torso-pierna',4,'deadlift',3,4,6,180, i=>'{"type":"rir","value":2}');
select pg_temp.b('torso-pierna',4,'db-lunge',3,10,12,90);
select pg_temp.b('torso-pierna',4,'hip-thrust',3,8,12,90);
select pg_temp.b('torso-pierna',4,'leg-extension',3,12,15,60);
select pg_temp.b('torso-pierna',4,'leg-curl',3,12,15,60);
select pg_temp.b('torso-pierna',4,'calf-raise',4,10,15,60);

-- ---------------------------------------------------------------------
-- 3. PUSH / PULL / LEGS
-- ---------------------------------------------------------------------
select pg_temp.day('ppl',1,'Push');
select pg_temp.b('ppl',1,'bench-press',4,6,10,150);
select pg_temp.b('ppl',1,'incline-db-press',3,8,12,120);
select pg_temp.b('ppl',1,'overhead-press',3,8,10,120);
select pg_temp.b('ppl',1,'lateral-raise',3,12,15,60);
select pg_temp.b('ppl',1,'triceps-pushdown',3,10,12,60);
select pg_temp.b('ppl',1,'overhead-triceps-ext',2,12,15,60);

select pg_temp.day('ppl',2,'Pull');
select pg_temp.b('ppl',2,'pull-up',4,6,10,150);
select pg_temp.b('ppl',2,'barbell-row',3,8,10,120);
select pg_temp.b('ppl',2,'seated-cable-row',3,10,12,90);
select pg_temp.b('ppl',2,'face-pull',3,12,15,60);
select pg_temp.b('ppl',2,'barbell-curl',3,8,12,75);
select pg_temp.b('ppl',2,'hammer-curl',2,10,12,60);

select pg_temp.day('ppl',3,'Legs');
select pg_temp.b('ppl',3,'back-squat',4,6,10,180);
select pg_temp.b('ppl',3,'romanian-deadlift',3,8,10,150);
select pg_temp.b('ppl',3,'leg-press',3,10,12,120);
select pg_temp.b('ppl',3,'leg-curl',3,10,12,75);
select pg_temp.b('ppl',3,'calf-raise',4,10,15,60);

-- ---------------------------------------------------------------------
-- 4. STRONGLIFTS 5x5  (peso lo define la progresión lineal)
-- ---------------------------------------------------------------------
select pg_temp.day('stronglifts-5x5',1,'Entrenamiento A');
select pg_temp.b('stronglifts-5x5',1,'back-squat',5,5,5,180, i=>'{"type":"none"}');
select pg_temp.b('stronglifts-5x5',1,'bench-press',5,5,5,180, i=>'{"type":"none"}');
select pg_temp.b('stronglifts-5x5',1,'barbell-row',5,5,5,180, i=>'{"type":"none"}');

select pg_temp.day('stronglifts-5x5',2,'Entrenamiento B');
select pg_temp.b('stronglifts-5x5',2,'back-squat',5,5,5,180, i=>'{"type":"none"}');
select pg_temp.b('stronglifts-5x5',2,'overhead-press',5,5,5,180, i=>'{"type":"none"}');
select pg_temp.b('stronglifts-5x5',2,'deadlift',1,5,5,180, i=>'{"type":"none"}',
  prog=>'{"kind":"linear","inc_kg":5,"fail_limit":3,"deload_pct":0.1}');

-- ---------------------------------------------------------------------
-- 5. 5/3/1 (+ Boring But Big)
--    Principal: wave_531 (override por bloque, TM por ejercicio)
--    BBB: 5x10 al 50% del TM; accesorios: double (default del método)
-- ---------------------------------------------------------------------
select pg_temp.day('531',1,'Press militar');
select pg_temp.b('531',1,'overhead-press',3,1,5,180, i=>'{"type":"pct_tm","value":null}',
  prog=>'{"kind":"wave_531","tm_pct":0.9,"inc_kg":2.5}', notes=>'Última serie AMRAP');
select pg_temp.b('531',1,'overhead-press',5,10,10,90, i=>'{"type":"pct_tm","value":0.5}', prog=>'{"kind":"none"}', notes=>'BBB');
select pg_temp.b('531',1,'chin-up',5,5,10,90);

select pg_temp.day('531',2,'Peso muerto');
select pg_temp.b('531',2,'deadlift',3,1,5,180, i=>'{"type":"pct_tm","value":null}',
  prog=>'{"kind":"wave_531","tm_pct":0.9,"inc_kg":5}', notes=>'Última serie AMRAP');
select pg_temp.b('531',2,'deadlift',5,10,10,90, i=>'{"type":"pct_tm","value":0.5}', prog=>'{"kind":"none"}', notes=>'BBB');
select pg_temp.b('531',2,'hanging-leg-raise',5,10,15,60);

select pg_temp.day('531',3,'Banca');
select pg_temp.b('531',3,'bench-press',3,1,5,180, i=>'{"type":"pct_tm","value":null}',
  prog=>'{"kind":"wave_531","tm_pct":0.9,"inc_kg":2.5}', notes=>'Última serie AMRAP');
select pg_temp.b('531',3,'bench-press',5,10,10,90, i=>'{"type":"pct_tm","value":0.5}', prog=>'{"kind":"none"}', notes=>'BBB');
select pg_temp.b('531',3,'db-row',5,10,12,60);

select pg_temp.day('531',4,'Sentadilla');
select pg_temp.b('531',4,'back-squat',3,1,5,180, i=>'{"type":"pct_tm","value":null}',
  prog=>'{"kind":"wave_531","tm_pct":0.9,"inc_kg":5}', notes=>'Última serie AMRAP');
select pg_temp.b('531',4,'back-squat',5,10,10,90, i=>'{"type":"pct_tm","value":0.5}', prog=>'{"kind":"none"}', notes=>'BBB');
select pg_temp.b('531',4,'leg-curl',5,10,12,60);

-- ---------------------------------------------------------------------
-- 6. PHUL  (fuerza: override lineal RPE 8; hipertrofia: double)
-- ---------------------------------------------------------------------
select pg_temp.day('phul',1,'Torso fuerza');
select pg_temp.b('phul',1,'bench-press',3,3,5,180, i=>'{"type":"rpe","value":8}', prog=>'{"kind":"linear","inc_kg":2.5,"fail_limit":2,"deload_pct":0.1}');
select pg_temp.b('phul',1,'barbell-row',3,3,5,180, i=>'{"type":"rpe","value":8}', prog=>'{"kind":"linear","inc_kg":2.5,"fail_limit":2,"deload_pct":0.1}');
select pg_temp.b('phul',1,'overhead-press',2,6,10,120);
select pg_temp.b('phul',1,'lat-pulldown',2,6,10,90);
select pg_temp.b('phul',1,'barbell-curl',2,6,10,75);
select pg_temp.b('phul',1,'skull-crusher',2,6,10,75);

select pg_temp.day('phul',2,'Pierna fuerza');
select pg_temp.b('phul',2,'back-squat',3,3,5,180, i=>'{"type":"rpe","value":8}', prog=>'{"kind":"linear","inc_kg":5,"fail_limit":2,"deload_pct":0.1}');
select pg_temp.b('phul',2,'deadlift',3,3,5,180, i=>'{"type":"rpe","value":8}', prog=>'{"kind":"linear","inc_kg":5,"fail_limit":2,"deload_pct":0.1}');
select pg_temp.b('phul',2,'leg-press',3,10,15,120);
select pg_temp.b('phul',2,'leg-curl',3,6,10,75);
select pg_temp.b('phul',2,'calf-raise',4,6,10,60);

select pg_temp.day('phul',3,'Torso hipertrofia');
select pg_temp.b('phul',3,'incline-db-press',3,8,12,90);
select pg_temp.b('phul',3,'cable-fly',3,8,12,60);
select pg_temp.b('phul',3,'seated-cable-row',3,8,12,90);
select pg_temp.b('phul',3,'db-row',3,8,12,90);
select pg_temp.b('phul',3,'lateral-raise',3,8,12,60);
select pg_temp.b('phul',3,'db-curl',3,8,12,60, grp=>'A', tech=>'superserie');
select pg_temp.b('phul',3,'triceps-pushdown',3,8,12,60, grp=>'A', tech=>'superserie');

select pg_temp.day('phul',4,'Pierna hipertrofia');
select pg_temp.b('phul',4,'front-squat',3,8,12,120);
select pg_temp.b('phul',4,'db-lunge',3,8,12,90);
select pg_temp.b('phul',4,'leg-extension',3,10,15,60, tech=>'myo-reps', tp=>'{"activation_reps":15,"mini_reps":4,"mini_sets":4}');
select pg_temp.b('phul',4,'leg-curl',3,10,15,60);
select pg_temp.b('phul',4,'calf-raise',4,8,12,60);

-- ---------------------------------------------------------------------
-- 7. GVT  (ciclo de 5 días: día1, día2, off, día3, off)
-- ---------------------------------------------------------------------
select pg_temp.day('gvt',1,'Pecho y espalda');
select pg_temp.b('gvt',1,'bench-press',10,10,10,90, i=>'{"type":"pct_1rm","value":0.6}', grp=>'A', tech=>'superserie', tempo=>'4-0-2-0');
select pg_temp.b('gvt',1,'barbell-row',10,10,10,90, i=>'{"type":"pct_1rm","value":0.6}', grp=>'A', tech=>'superserie', tempo=>'4-0-2-0');
select pg_temp.b('gvt',1,'db-fly',3,10,12,60, grp=>'B', tech=>'superserie', prog=>'{"kind":"double","inc_kg":2}');
select pg_temp.b('gvt',1,'db-row',3,10,12,60, grp=>'B', tech=>'superserie', prog=>'{"kind":"double","inc_kg":2}');

select pg_temp.day('gvt',2,'Piernas');
select pg_temp.b('gvt',2,'back-squat',10,10,10,90, i=>'{"type":"pct_1rm","value":0.6}', grp=>'A', tech=>'superserie', tempo=>'4-0-2-0');
select pg_temp.b('gvt',2,'leg-curl',10,10,10,90, i=>'{"type":"pct_1rm","value":0.6}', grp=>'A', tech=>'superserie', tempo=>'4-0-2-0');
select pg_temp.b('gvt',2,'calf-raise',3,15,20,60, prog=>'{"kind":"double","inc_kg":2.5}');

select pg_temp.day('gvt',3,'Brazos y hombros');
select pg_temp.b('gvt',3,'close-grip-bench',10,10,10,90, i=>'{"type":"pct_1rm","value":0.6}', grp=>'A', tech=>'superserie', tempo=>'4-0-2-0');
select pg_temp.b('gvt',3,'barbell-curl',10,10,10,90, i=>'{"type":"pct_1rm","value":0.6}', grp=>'A', tech=>'superserie', tempo=>'4-0-2-0');
select pg_temp.b('gvt',3,'lateral-raise',3,10,12,60, grp=>'B', tech=>'superserie', prog=>'{"kind":"double","inc_kg":2}');
select pg_temp.b('gvt',3,'rear-delt-fly',3,10,12,60, grp=>'B', tech=>'superserie', prog=>'{"kind":"double","inc_kg":2}');

-- ---------------------------------------------------------------------
-- 8. HEAVY DUTY  (todo al fallo; superseries = pre-agotamiento)
-- ---------------------------------------------------------------------
select pg_temp.day('heavy-duty',1,'Pecho y espalda');
select pg_temp.b('heavy-duty',1,'db-fly',1,6,10,0, i=>'{"type":"rir","value":0}', grp=>'A', tech=>'superserie', stype=>'failure', notes=>'Pre-agotamiento');
select pg_temp.b('heavy-duty',1,'incline-bench-press',1,6,10,180, i=>'{"type":"rir","value":0}', grp=>'A', tech=>'superserie', stype=>'failure');
select pg_temp.b('heavy-duty',1,'pullover',1,6,10,0, i=>'{"type":"rir","value":0}', grp=>'B', tech=>'superserie', stype=>'failure', notes=>'Pre-agotamiento');
select pg_temp.b('heavy-duty',1,'close-grip-pulldown',1,6,10,180, i=>'{"type":"rir","value":0}', grp=>'B', tech=>'superserie', stype=>'failure');
select pg_temp.b('heavy-duty',1,'deadlift',1,5,8,180, i=>'{"type":"rir","value":0}', stype=>'failure');

select pg_temp.day('heavy-duty',2,'Piernas');
select pg_temp.b('heavy-duty',2,'leg-extension',1,8,15,0, i=>'{"type":"rir","value":0}', grp=>'A', tech=>'superserie', stype=>'failure', notes=>'Pre-agotamiento');
select pg_temp.b('heavy-duty',2,'leg-press',1,8,15,180, i=>'{"type":"rir","value":0}', grp=>'A', tech=>'superserie', stype=>'failure');
select pg_temp.b('heavy-duty',2,'leg-curl',1,6,10,120, i=>'{"type":"rir","value":0}', stype=>'failure');
select pg_temp.b('heavy-duty',2,'calf-raise',1,12,20,120, i=>'{"type":"rir","value":0}', stype=>'failure');

select pg_temp.day('heavy-duty',3,'Hombros y brazos');
select pg_temp.b('heavy-duty',3,'lateral-raise',1,6,10,120, i=>'{"type":"rir","value":0}', stype=>'failure');
select pg_temp.b('heavy-duty',3,'rear-delt-fly',1,6,10,120, i=>'{"type":"rir","value":0}', stype=>'failure');
select pg_temp.b('heavy-duty',3,'barbell-curl',1,6,10,120, i=>'{"type":"rir","value":0}', tech=>'rest-pause', tp=>'{"mini_sets":2,"rest_sec":15}', stype=>'failure');
select pg_temp.b('heavy-duty',3,'triceps-pushdown',1,6,10,0, i=>'{"type":"rir","value":0}', grp=>'A', tech=>'superserie', stype=>'failure', notes=>'Pre-agotamiento');
select pg_temp.b('heavy-duty',3,'dip',1,6,10,120, i=>'{"type":"rir","value":0}', grp=>'A', tech=>'superserie', stype=>'failure');

-- ---------------------------------------------------------------------
-- 9. FST-7  (último ejercicio de cada músculo = finisher 7 series)
-- ---------------------------------------------------------------------
select pg_temp.day('fst-7',1,'Pecho');
select pg_temp.b('fst-7',1,'incline-db-press',4,8,12,90, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',1,'bench-press',3,8,12,90, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',1,'pec-deck',7,8,12,35, i=>'{"type":"rir","value":1}', tech=>'fst7-finisher', tp=>'{"rest_sec":[30,45]}');

select pg_temp.day('fst-7',2,'Espalda');
select pg_temp.b('fst-7',2,'pull-up',4,6,10,90, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',2,'barbell-row',3,8,12,90, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',2,'seated-cable-row',3,8,12,90, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',2,'pullover',7,8,12,35, i=>'{"type":"rir","value":1}', tech=>'fst7-finisher', tp=>'{"rest_sec":[30,45]}');

select pg_temp.day('fst-7',3,'Piernas');
select pg_temp.b('fst-7',3,'leg-extension',3,12,15,60, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',3,'back-squat',4,8,12,120, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',3,'leg-press',7,8,12,40, i=>'{"type":"rir","value":1}', tech=>'fst7-finisher', tp=>'{"rest_sec":[30,45]}');
select pg_temp.b('fst-7',3,'romanian-deadlift',3,8,12,90, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',3,'leg-curl',7,8,12,35, i=>'{"type":"rir","value":1}', tech=>'fst7-finisher', tp=>'{"rest_sec":[30,45]}');
select pg_temp.b('fst-7',3,'calf-raise',7,10,15,30, i=>'{"type":"rir","value":1}', tech=>'fst7-finisher', tp=>'{"rest_sec":[30,45]}');

select pg_temp.day('fst-7',4,'Hombros');
select pg_temp.b('fst-7',4,'db-shoulder-press',4,8,12,90, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',4,'rear-delt-fly',3,12,15,60, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',4,'lateral-raise',7,10,12,35, i=>'{"type":"rir","value":1}', tech=>'fst7-finisher', tp=>'{"rest_sec":[30,45]}');

select pg_temp.day('fst-7',5,'Brazos');
select pg_temp.b('fst-7',5,'barbell-curl',3,8,12,75, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',5,'hammer-curl',3,10,12,60, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',5,'preacher-curl',7,8,12,35, i=>'{"type":"rir","value":1}', tech=>'fst7-finisher', tp=>'{"rest_sec":[30,45]}');
select pg_temp.b('fst-7',5,'close-grip-bench',3,8,12,90, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',5,'skull-crusher',3,10,12,60, i=>'{"type":"rir","value":1}');
select pg_temp.b('fst-7',5,'triceps-pushdown',7,8,12,35, i=>'{"type":"rir","value":1}', tech=>'fst7-finisher', tp=>'{"rest_sec":[30,45]}');

-- ---------------------------------------------------------------------
-- 10. ARNOLD SPLIT  (A/B/C dos veces por semana)
-- ---------------------------------------------------------------------
select pg_temp.day('arnold-split',1,'Pecho y espalda');
select pg_temp.b('arnold-split',1,'bench-press',4,6,10,120, i=>'{"type":"rir","value":1}', tech=>'piramide', tp=>'{"reps":[10,8,8,6]}');
select pg_temp.b('arnold-split',1,'pull-up',4,8,10,120, i=>'{"type":"rir","value":1}');
select pg_temp.b('arnold-split',1,'incline-bench-press',4,8,10,90, i=>'{"type":"rir","value":1}', grp=>'A', tech=>'superserie');
select pg_temp.b('arnold-split',1,'barbell-row',4,8,10,90, i=>'{"type":"rir","value":1}', grp=>'A', tech=>'superserie');
select pg_temp.b('arnold-split',1,'db-fly',3,10,12,60, i=>'{"type":"rir","value":1}', grp=>'B', tech=>'superserie');
select pg_temp.b('arnold-split',1,'pullover',3,10,12,60, i=>'{"type":"rir","value":1}', grp=>'B', tech=>'superserie');

select pg_temp.day('arnold-split',2,'Hombros y brazos');
select pg_temp.b('arnold-split',2,'overhead-press',4,6,10,120, i=>'{"type":"rir","value":1}');
select pg_temp.b('arnold-split',2,'arnold-press',3,8,12,90, i=>'{"type":"rir","value":1}');
select pg_temp.b('arnold-split',2,'lateral-raise',4,10,12,45, i=>'{"type":"rir","value":1}', grp=>'A', tech=>'superserie');
select pg_temp.b('arnold-split',2,'rear-delt-fly',3,10,12,45, i=>'{"type":"rir","value":1}', grp=>'A', tech=>'superserie');
select pg_temp.b('arnold-split',2,'barbell-curl',4,8,10,75, i=>'{"type":"rir","value":1}', grp=>'B', tech=>'superserie');
select pg_temp.b('arnold-split',2,'close-grip-bench',4,8,10,75, i=>'{"type":"rir","value":1}', grp=>'B', tech=>'superserie');
select pg_temp.b('arnold-split',2,'preacher-curl',3,10,12,60, i=>'{"type":"rir","value":1}', grp=>'C', tech=>'superserie');
select pg_temp.b('arnold-split',2,'overhead-triceps-ext',3,10,12,60, i=>'{"type":"rir","value":1}', grp=>'C', tech=>'superserie');

select pg_temp.day('arnold-split',3,'Piernas');
select pg_temp.b('arnold-split',3,'back-squat',5,6,10,150, i=>'{"type":"rir","value":1}', tech=>'piramide', tp=>'{"reps":[10,8,8,6,6]}');
select pg_temp.b('arnold-split',3,'romanian-deadlift',4,8,10,120, i=>'{"type":"rir","value":1}');
select pg_temp.b('arnold-split',3,'db-lunge',3,10,12,90, i=>'{"type":"rir","value":1}');
select pg_temp.b('arnold-split',3,'leg-curl',4,10,12,60, i=>'{"type":"rir","value":1}');
select pg_temp.b('arnold-split',3,'calf-raise',5,12,15,45, i=>'{"type":"rir","value":1}');
select pg_temp.b('arnold-split',3,'hanging-leg-raise',3,12,15,45, i=>'{"type":"rir","value":1}');

-- ---------------------------------------------------------------------
-- 11. BRO SPLIT
-- ---------------------------------------------------------------------
select pg_temp.day('bro-split',1,'Pecho');
select pg_temp.b('bro-split',1,'bench-press',4,6,10,150);
select pg_temp.b('bro-split',1,'incline-db-press',3,8,12,120);
select pg_temp.b('bro-split',1,'dip',3,8,12,90);
select pg_temp.b('bro-split',1,'cable-fly',3,12,15,60, i=>'{"type":"rir","value":1}');

select pg_temp.day('bro-split',2,'Espalda');
select pg_temp.b('bro-split',2,'deadlift',3,5,8,180);
select pg_temp.b('bro-split',2,'pull-up',3,6,10,120);
select pg_temp.b('bro-split',2,'barbell-row',3,8,10,120);
select pg_temp.b('bro-split',2,'seated-cable-row',3,10,12,90);
select pg_temp.b('bro-split',2,'pullover',2,12,15,60, i=>'{"type":"rir","value":1}');

select pg_temp.day('bro-split',3,'Hombros');
select pg_temp.b('bro-split',3,'overhead-press',4,6,10,150);
select pg_temp.b('bro-split',3,'lateral-raise',4,12,15,60, i=>'{"type":"rir","value":1}');
select pg_temp.b('bro-split',3,'rear-delt-fly',3,12,15,60, i=>'{"type":"rir","value":1}');
select pg_temp.b('bro-split',3,'face-pull',3,12,15,60);
select pg_temp.b('bro-split',3,'shrug',3,10,15,60);

select pg_temp.day('bro-split',4,'Piernas');
select pg_temp.b('bro-split',4,'back-squat',4,6,10,180);
select pg_temp.b('bro-split',4,'leg-press',3,10,12,120);
select pg_temp.b('bro-split',4,'romanian-deadlift',3,8,10,120);
select pg_temp.b('bro-split',4,'leg-extension',3,12,15,60, i=>'{"type":"rir","value":1}');
select pg_temp.b('bro-split',4,'leg-curl',3,10,12,60, i=>'{"type":"rir","value":1}');
select pg_temp.b('bro-split',4,'calf-raise',4,10,15,60);

select pg_temp.day('bro-split',5,'Brazos');
select pg_temp.b('bro-split',5,'barbell-curl',3,8,12,75);
select pg_temp.b('bro-split',5,'close-grip-bench',3,6,10,120);
select pg_temp.b('bro-split',5,'hammer-curl',3,10,12,60);
select pg_temp.b('bro-split',5,'skull-crusher',3,10,12,60);
select pg_temp.b('bro-split',5,'preacher-curl',2,12,15,60, i=>'{"type":"rir","value":0}', tech=>'drop-set', tp=>'{"drops":2,"drop_pct":0.25}');
select pg_temp.b('bro-split',5,'triceps-pushdown',2,12,15,60, i=>'{"type":"rir","value":0}', tech=>'drop-set', tp=>'{"drops":2,"drop_pct":0.25}');

-- ---------------------------------------------------------------------
-- 12. CALISTENIA BASE
-- ---------------------------------------------------------------------
select pg_temp.day('calistenia-base',1,'Calistenia A');
select pg_temp.b('calistenia-base',1,'push-up',3,8,15,90);
select pg_temp.b('calistenia-base',1,'inverted-row',3,8,12,90);
select pg_temp.b('calistenia-base',1,'bw-squat',3,15,25,60);
select pg_temp.b('calistenia-base',1,'pike-push-up',3,6,10,90);
select pg_temp.b('calistenia-base',1,'glute-bridge',3,12,20,60);
select pg_temp.b('calistenia-base',1,'plank',3,30,60,60, i=>'{"type":"none"}', unit=>'sec', prog=>'{"kind":"reps","inc_reps":5}');

select pg_temp.day('calistenia-base',2,'Calistenia B');
select pg_temp.b('calistenia-base',2,'pull-up',3,3,8,120, tech=>'negativas', tp=>'{"eccentric_sec":4}', notes=>'Si no sacás 3, hacé solo negativas');
select pg_temp.b('calistenia-base',2,'dip',3,5,10,120);
select pg_temp.b('calistenia-base',2,'bw-lunge',3,10,15,60);
select pg_temp.b('calistenia-base',2,'push-up',3,8,15,90);
select pg_temp.b('calistenia-base',2,'hanging-leg-raise',3,6,12,60);
select pg_temp.b('calistenia-base',2,'plank',3,30,60,60, i=>'{"type":"none"}', unit=>'sec', prog=>'{"kind":"reps","inc_reps":5}');

commit;

-- Chequeo rápido
-- select m.slug, count(distinct t.id) dias, count(b.id) bloques
-- from methods m join method_templates t on t.method_id = m.id
-- join template_blocks b on b.template_id = t.id group by m.slug order by m.slug;
