import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';

// ----------------------------------------------------------------- hápticos (nunca rompen si el teléfono no vibra)
export const haptic = {
  tap: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
  select: () => { Haptics.selectionAsync().catch(() => {}); },
  success: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  warn: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); },
};

// ----------------------------------------------------------------- errores en castellano
// Los errores propios ya vienen en castellano; los de SQLite, red o JS (en inglés) se traducen a algo entendible.
const NETWORK = /network|fetch|timeout|timed out|offline|socket|connection|ECONN|ENOTFOUND|503|502|504/i;
const TECH = /sqlite|constraint|undefined|null is not|is not a function|cannot|can't|failed|unexpected|exception|typeerror|referenceerror|json|syntax|invalid|denied|not found|error/i;
const SPANISH = /[áéíóúñ¿¡]|\b(sin|no|falta|faltan|se|el|la|los|las|de|del|una?|probá|revisá|entrá|entre|y|que|con|para|por|tu|tus|es|hay|mínimo|máximo)\b/i;

export function friendlyError(e: unknown, fallback = 'Algo falló. Probá de nuevo.'): string {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (!msg.trim()) return fallback;
  if (NETWORK.test(msg) && !SPANISH.test(msg)) return 'Sin conexión. Probá de nuevo cuando tengas señal.';
  if (SPANISH.test(msg) && !TECH.test(msg)) return msg;
  if (__DEV__) console.warn('[error]', msg);
  return fallback;
}

export function showError(title: string, e: unknown) {
  haptic.warn();
  Alert.alert(title, friendlyError(e));
}

// ----------------------------------------------------------------- confirmación de acciones que borran
// Siempre dice qué se borra; el botón rojo es el destructivo y Cancelar queda como opción segura.
export function confirmDestructive({
  title, message, confirmLabel = 'Borrar', onConfirm,
}: { title: string; message: string; confirmLabel?: string; onConfirm: () => unknown }) {
  haptic.warn();
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: confirmLabel, style: 'destructive',
      onPress: () => {
        try {
          const r = onConfirm();
          if (r instanceof Promise) r.catch((e) => showError('No se pudo completar', e));
        } catch (e) { showError('No se pudo completar', e); }
      },
    },
  ], { cancelable: true });
}

// ----------------------------------------------------------------- números
// Acepta "72,5" y "72.5"; null si está vacío o no es un número
export function parseDecimal(s: string | null | undefined): number | null {
  const t = (s ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  if (!/^-?\d*\.?\d*$/.test(t) || t === '.' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Mensaje claro si el número está fuera de rango (null = está bien o vacío)
export function rangeError(
  s: string | null | undefined,
  { min, max, label, unit = '', integer = false, required = false }:
  { min: number; max: number; label: string; unit?: string; integer?: boolean; required?: boolean },
): string | null {
  const raw = (s ?? '').trim();
  if (!raw) return required ? `${label}: falta completar.` : null;
  const n = parseDecimal(raw);
  const fmt = (v: number) => String(v).replace('.', ',');
  const u = unit ? ` ${unit}` : '';
  if (n == null) return `${label}: escribí solo números (ej. ${integer ? '8' : '72,5'}).`;
  if (n < 0) return `${label}: no puede ser negativo.`;
  if (integer && !Number.isInteger(n)) return `${label}: tiene que ser un número entero.`;
  if (n < min || n > max) return `${label}: tiene que estar entre ${fmt(min)} y ${fmt(max)}${u}.`;
  return null;
}

// Deja solo dígitos y un separador decimal mientras se escribe (sin signo menos)
export function sanitizeNumeric(t: string, decimal: boolean): string {
  if (!decimal) return t.replace(/\D/g, '');
  let out = '';
  let sep = false;
  for (const ch of t) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if ((ch === ',' || ch === '.') && !sep) { out += ch; sep = true; }
  }
  return out;
}
