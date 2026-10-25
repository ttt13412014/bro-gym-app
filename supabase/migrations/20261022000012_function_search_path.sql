-- =====================================================================
-- 012 — fijar search_path de funciones (advisor 0011 function_search_path_mutable)
-- =====================================================================
alter function public.set_updated_at() set search_path = '';
alter function public.clone_method_to_routine(text, text) set search_path = public;
