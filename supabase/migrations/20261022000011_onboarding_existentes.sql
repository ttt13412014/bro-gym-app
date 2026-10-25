-- =====================================================================
-- Bro? · 011 — usuarios existentes sin fila en user_settings
-- 010 marcó como hechos solo a los que ya tenían fila. Los que nunca tocaron ajustes
-- pero ya usan la app (rutina, sesiones o perfil) no tienen que ver la bienvenida.
-- =====================================================================
begin;

insert into user_settings (user_id, onboarded_at)
select u.id, now() from auth.users u
where exists (select 1 from user_routines r where r.user_id = u.id)
   or exists (select 1 from workout_sessions s where s.user_id = u.id)
   or exists (select 1 from nutrition_profiles p where p.user_id = u.id)
on conflict (user_id) do nothing;

commit;
