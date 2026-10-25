// Importa free-exercise-db a Supabase: completa imágenes/instrucciones de los 48 ejercicios base
// (match por nombre) y agrega el resto del catálogo (~870) como ejercicios globales.
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-free-exercise-db.mjs
import { createClient } from '@supabase/supabase-js';

const SRC = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const res = await fetch(SRC);
if (!res.ok) throw new Error(`No se pudo bajar el catálogo: ${res.status}`);
const items = await res.json();

const { data: existing, error } = await sb.from('exercises').select('id, slug, name').is('owner_id', null);
if (error) throw error;
const byName = new Map(existing.map((e) => [norm(e.name), e]));
const slugs = new Set(existing.map((e) => e.slug));

let updated = 0, inserted = 0;
const toInsert = [];
for (const x of items) {
  const fields = {
    source: 'free-exercise-db', source_id: x.id, category: x.category ?? 'strength', level: x.level ?? null,
    mechanic: x.mechanic === 'compound' || x.mechanic === 'isolation' ? x.mechanic : null,
    force: ['push', 'pull', 'static'].includes(x.force) ? x.force : null,
    equipment: x.equipment ?? null, primary_muscles: x.primaryMuscles ?? [], secondary_muscles: x.secondaryMuscles ?? [],
    images: x.images ?? [], instructions: x.instructions ?? [],
  };
  const hit = byName.get(norm(x.name));
  if (hit) {
    // los base ya tienen músculos/patrón curados: solo se completan imágenes, instrucciones y source_id
    const { error: e } = await sb.from('exercises')
      .update({ source_id: x.id, images: fields.images, instructions: fields.instructions, level: fields.level })
      .eq('id', hit.id);
    if (e) console.warn('update', x.name, e.message); else updated++;
    continue;
  }
  let slug = slugify(x.id);
  while (slugs.has(slug)) slug += '-x';
  slugs.add(slug);
  toInsert.push({ ...fields, slug, name: x.name, name_es: x.name }); // name_es en inglés hasta traducir
}

for (let i = 0; i < toInsert.length; i += 200) {
  const { error: e } = await sb.from('exercises').upsert(toInsert.slice(i, i + 200), { onConflict: 'source_id' });
  if (e) throw e;
  inserted += Math.min(200, toInsert.length - i);
}
console.log(`Listo: ${updated} base completados, ${inserted} nuevos.`);
const missing = existing.filter((e) => ![...items].some((x) => norm(x.name) === norm(e.name)));
if (missing.length) console.log('Sin match (cargar imágenes a mano):', missing.map((e) => e.slug).join(', '));
