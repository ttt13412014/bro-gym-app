// "Mover un día": cambio por única vez del entreno de una fecha, sin tocar la rutina.
// Se guarda en user_settings.day_overrides (JSON por fecha local):
//   { "2026-10-23": { rest: true, to: "2026-10-25", day: "<routine_day_id>" },
//     "2026-10-25": { day: "<routine_day_id>", from: "2026-10-23" } }
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import { setSettings } from '@/lib/settings';
import { addDays } from '@/progress/stats';
import { parseJson } from './data';

export type DayOverride = { rest?: boolean; to?: string; from?: string; day?: string };
export type DayOverrides = Record<string, DayOverride>;

export const parseOverrides = (raw: string | null | undefined): DayOverrides => {
  const o = parseJson<unknown>(raw ?? null, {});
  return o && typeof o === 'object' && !Array.isArray(o) ? (o as DayOverrides) : {};
};

// Lo de hace más de 2 semanas ya no sirve
const prune = (o: DayOverrides, today: string) => {
  const min = addDays(today, -14);
  return Object.fromEntries(Object.entries(o).filter(([d]) => d >= min));
};

const save = (db: AbstractPowerSyncDatabase, o: DayOverrides) =>
  setSettings(db, { day_overrides: Object.keys(o).length ? JSON.stringify(o) : null });

function clearFrom(o: DayOverrides, date: string) {
  const to = o[date]?.to;
  if (to && o[to]?.from === date) delete o[to];
  delete o[date];
}

export async function moveDay(db: AbstractPowerSyncDatabase, current: DayOverrides, date: string, dayId: string, to: string) {
  const o = prune({ ...current }, date);
  // si hoy ya era un entreno movido, se vuelve a mover desde su día original (si no, ese día
  // seguía diciendo "lo pasaste a hoy")
  const origin = o[date]?.from && o[o[date]!.from!]?.to === date ? o[date]!.from! : null;
  clearFrom(o, date);
  if (o[to]?.from) clearFrom(o, o[to]!.from!);
  if (origin) {
    o[origin] = { rest: true, to, day: dayId };
    o[to] = { day: dayId, from: origin };
  } else {
    o[date] = { rest: true, to, day: dayId };
    o[to] = { day: dayId, from: date };
  }
  await save(db, o);
}

// Entreno pasado a una fecha que todavía no llegó: desde qué día y hasta cuál (para los días del medio)
export function pendingMove(o: DayOverrides, today: string, dayId: string | undefined) {
  if (!dayId) return null;
  for (const [origin, v] of Object.entries(o)) {
    if (v.rest && v.day === dayId && v.to && origin <= today && v.to > today) return { origin, to: v.to, day: dayId };
  }
  return null;
}

export async function undoMove(db: AbstractPowerSyncDatabase, current: DayOverrides, date: string, today: string) {
  const o = prune({ ...current }, today);
  const from = o[date]?.from;
  if (from) clearFrom(o, from);
  else clearFrom(o, date);
  await save(db, o);
}
