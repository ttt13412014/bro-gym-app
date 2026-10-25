-- Bro? · 006 — ajuste semanal acumulado en cada objetivo
-- Guardar el perfil recalcula el objetivo desde cero; con esto se conserva lo que fueron ajustando las revisiones.
alter table nutrition_targets
  add column adjust_kcal int not null default 0 check (adjust_kcal between -1500 and 1500);
