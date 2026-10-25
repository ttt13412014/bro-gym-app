// Open Food Facts: búsqueda por código de barras y por texto.
// Reglas de uso de OFF: User-Agent propio y no más de ~10 búsquedas/min (por eso la búsqueda es al enviar, no al tipear).
// Poné un mail de contacto real en el User-Agent antes de publicar la app.
const UA = 'BroApp/0.1 (app de entrenamiento; contacto: completar@mail.com)';
const FIELDS = [
  'code', 'product_name', 'product_name_es', 'brands', 'nutriments', 'serving_quantity', 'serving_size',
  'image_front_small_url',
].join(',');

export type OffFood = {
  barcode: string; name: string; brand: string | null;
  kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number; fiber_100g: number | null;
  serving_g: number | null; serving_label: string | null; image_url: string | null;
};

type OffProduct = {
  code?: string; product_name?: string; product_name_es?: string; brands?: string;
  nutriments?: Record<string, number | string | undefined>;
  serving_quantity?: number | string; serving_size?: string; image_front_small_url?: string;
};

const num = (v: unknown) => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

// Devuelve el alimento y qué macros faltan (OFF a veces no los trae: no se asumen 0 en silencio)
function normalize(p: OffProduct): { food: OffFood; missing: string[] } | null {
  const n = p.nutriments ?? {};
  const kj = num(n['energy_100g']);
  const kcal = num(n['energy-kcal_100g']) ?? (kj != null ? kj / 4.184 : null);
  const name = (p.product_name_es || p.product_name || '').trim();
  if (!p.code || !name) return null;
  const prot = num(n['proteins_100g']);
  const carb = num(n['carbohydrates_100g']);
  const fat = num(n['fat_100g']);
  const missing = [
    kcal == null && 'calorías', prot == null && 'proteínas', carb == null && 'carbohidratos', fat == null && 'grasas',
  ].filter((x): x is string => !!x);
  const r1 = (x: number | null) => (x == null ? 0 : Math.round(x * 10) / 10);
  return {
    missing,
    food: {
      barcode: p.code, name, brand: p.brands?.split(',')[0]?.trim() || null,
      kcal_100g: kcal == null ? 0 : Math.round(kcal * 10) / 10,
      protein_100g: r1(prot), carbs_100g: r1(carb), fat_100g: r1(fat), fiber_100g: num(n['fiber_100g']),
      serving_g: num(p.serving_quantity), serving_label: p.serving_size?.trim() || null,
      image_url: p.image_front_small_url ?? null,
    },
  };
}

class NetworkError extends Error {}

// Error de red / timeout -> NetworkError. Cualquier respuesta HTTP (incluido 404) -> status + json
async function get(url: string, timeoutMs = 8000): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
  } catch {
    throw new NetworkError('sin conexión');
  } finally {
    clearTimeout(t);
  }
  let json: Record<string, unknown> | null = null;
  try { json = (await res.json()) as Record<string, unknown>; } catch { /* cuerpo no JSON */ }
  return { status: res.status, json };
}

export type LookupResult =
  | { kind: 'found'; food: OffFood }
  | { kind: 'incomplete'; barcode: string; partial: OffFood | null; missing: string[] } // existe pero faltan datos
  | { kind: 'not_found' }
  | { kind: 'offline' }
  | { kind: 'error'; status: number };

export async function lookupBarcode(barcode: string): Promise<LookupResult> {
  let r: Awaited<ReturnType<typeof get>>;
  try {
    r = await get(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`);
  } catch (e) {
    if (e instanceof NetworkError) return { kind: 'offline' };
    throw e;
  }
  // OFF responde 404 + {status: 0} cuando el código no existe
  if (r.status === 404 || r.json?.status === 0) return { kind: 'not_found' };
  if (r.status >= 400 || !r.json) return { kind: 'error', status: r.status };
  const p = r.json.product as OffProduct | undefined;
  if (!p) return { kind: 'not_found' };
  const norm = normalize({ ...p, code: p.code ?? barcode });
  if (!norm) return { kind: 'incomplete', barcode, partial: null, missing: ['nombre'] };
  if (norm.missing.length) return { kind: 'incomplete', barcode, partial: norm.food, missing: norm.missing };
  return { kind: 'found', food: norm.food };
}

export type SearchResult =
  | { kind: 'ok'; foods: OffFood[] }
  | { kind: 'offline' }
  | { kind: 'error'; status: number }; // 429 (límite de OFF), 5xx, cuerpo inválido

// Búsqueda por texto, priorizando productos de Argentina
export async function searchFoods(q: string): Promise<SearchResult> {
  const term = q.trim();
  if (term.length < 3) return { kind: 'ok', foods: [] };
  let r: Awaited<ReturnType<typeof get>>;
  try {
    r = await get(
      `https://ar.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}` +
      `&search_simple=1&action=process&json=1&page_size=25&fields=${FIELDS}`,
    );
  } catch (e) {
    if (e instanceof NetworkError) return { kind: 'offline' };
    throw e;
  }
  if (r.status >= 400 || !r.json || !Array.isArray(r.json.products)) return { kind: 'error', status: r.status };
  // en búsqueda solo se muestran los completos; los incompletos se cargan escaneando o a mano
  const foods = (r.json.products as OffProduct[]).map(normalize)
    .filter((x): x is { food: OffFood; missing: string[] } => !!x && !x.missing.length)
    .map((x) => x.food);
  return { kind: 'ok', foods };
}
