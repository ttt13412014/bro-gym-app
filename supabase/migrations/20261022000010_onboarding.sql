-- =====================================================================
-- Bro? · 010 — primer arranque guiado
-- onboarded_at null = mostrar la bienvenida. Los usuarios que ya existen quedan como hechos.
-- =====================================================================
begin;

alter table user_settings add column onboarded_at timestamptz;
update user_settings set onboarded_at = now() where onboarded_at is null;

commit;
