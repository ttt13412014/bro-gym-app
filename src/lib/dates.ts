import { parseYmd } from './nutrition';

// DD/MM/AAAA -> YYYY-MM-DD solo si la fecha existe (rechaza 31/02)
export function dmyToIso(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return parseYmd(iso) ? iso : null;
}

export const isoToDmy = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

export const fmtShort = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
