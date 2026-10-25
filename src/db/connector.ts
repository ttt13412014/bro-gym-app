import {
  type AbstractPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
  UpdateType,
} from '@powersync/react-native';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { emitSyncNotice } from './syncEvents';

// Catálogo: solo baja, nunca se sube
const READ_ONLY = new Set([
  'methods', 'techniques', 'method_templates', 'template_blocks',
  'exercise_substitutes', 'builder_goal_rules', 'strength_levels', 'strength_standards',
]);

// Tablas cuya PK es user_id (localmente id = user_id)
const KEYED_BY_USER = new Set(['user_settings', 'nutrition_profiles']);

// Columnas que en SQLite son texto JSON y en Postgres jsonb / text[]
const JSON_COLS: Record<string, string[]> = {
  exercises: ['primary_muscles', 'secondary_muscles', 'images', 'instructions', 'joints'],
  user_settings: ['equipment', 'injured_joints', 'day_overrides'],
  user_routines: ['progression', 'rules'],
  user_routine_blocks: ['intensity', 'technique_params', 'progression'],
  workout_sets: ['target'],
};

// Columnas boolean que en SQLite son 0/1
const BOOL_COLS: Record<string, string[]> = {
  user_routines: ['is_active'],
  foods: ['is_favorite'],
  nutrition_profiles: ['auto_adjust'],
  weekly_checkins: ['applied'],
};

// Errores que no se arreglan reintentando: se saltea la operación y se avisa
// 22xxx datos inválidos · 23xxx constraint · 42501 RLS
const FATAL = [/^22...$/, /^23...$/, /^42501$/];

const LABEL: Record<string, string> = {
  workout_sets: 'una serie', workout_sessions: 'una sesión', food_logs: 'una comida',
  foods: 'un alimento', body_measurements: 'una medida', user_routines: 'una rutina',
  user_routine_blocks: 'un ejercicio de rutina', user_exercise_maxes: 'un 1RM',
};

// ids locales de foods reemplazados por el id que ya existía en el servidor (por código de barras)
const foodRemap = new Map<string, string>();

function toRemote(table: string, data: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...data };
  for (const c of JSON_COLS[table] ?? []) {
    const v = out[c];
    if (typeof v === 'string') {
      try { out[c] = JSON.parse(v); } catch { /* se deja como está */ }
    }
  }
  for (const c of BOOL_COLS[table] ?? []) {
    if (out[c] != null) out[c] = Boolean(out[c]);
  }
  return out;
}

async function applyOp(op: CrudEntry) {
  const table = op.table;
  if (READ_ONLY.has(table)) return;

  const keyCol = KEYED_BY_USER.has(table) ? 'user_id' : 'id';
  const q = supabase.from(table);

  // Comidas que apuntaban a un alimento unificado
  const data = { ...op.opData };
  if (table === 'food_logs' && typeof data.food_id === 'string' && foodRemap.has(data.food_id)) {
    data.food_id = foodRemap.get(data.food_id);
  }

  switch (op.op) {
    case UpdateType.PUT: {
      const row = toRemote(table, { ...data, [keyCol]: op.id });
      if (keyCol !== 'id') delete row.id;
      const { error } = await q.upsert(row, { onConflict: keyCol });
      if (error) throw error;
      break;
    }
    case UpdateType.PATCH: {
      const { error } = await q.update(toRemote(table, data)).eq(keyCol, op.id);
      if (error) throw error;
      break;
    }
    case UpdateType.DELETE: {
      // La app usa soft delete (deleted_at); esto queda para borrados explícitos
      const { error } = await q.delete().eq(keyCol, op.id);
      if (error) throw error;
      break;
    }
  }
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { data, error } = await supabase.auth.getSession();
    const session = data.session;
    if (error || !session) throw new Error('Sin sesión de Supabase');
    return {
      endpoint: env.powersyncUrl,
      token: session.access_token,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const tx = await database.getNextCrudTransaction();
    if (!tx) return;

    for (const op of tx.crud) {
      try {
        await applyOp(op);
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code ?? '';
        if (!FATAL.some((re) => re.test(code))) throw e; // red caída, 5xx: PowerSync reintenta todo (upserts idempotentes)

        // Mismo código de barras escaneado en otro dispositivo: se unifica con el del servidor
        if (code === '23505' && op.table === 'foods' && op.op === UpdateType.PUT) {
          if (await mergeFood(database, op)) continue;
        }

        // Resto de rechazos: se saltea para no trabar la cola y se avisa
        console.warn('[sync] rechazado', code, op.table, op.id, e);
        emitSyncNotice(
          'rejected',
          `El servidor rechazó ${LABEL[op.table] ?? 'un registro'}. Quedó guardado solo en este celular.`,
        );
      }
    }
    await tx.complete();
  }
}

// Reapunta las comidas locales al alimento que ya existe en el servidor y borra el duplicado local
async function mergeFood(db: AbstractPowerSyncDatabase, op: CrudEntry): Promise<boolean> {
  const barcode = op.opData?.barcode;
  const owner = op.opData?.owner_id;
  if (typeof barcode !== 'string' || typeof owner !== 'string') return false;

  const { data, error } = await supabase
    .from('foods').select('id, name')
    .eq('owner_id', owner).eq('barcode', barcode).is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return false;

  foodRemap.set(op.id, data.id);
  await db.writeTransaction(async (w) => {
    await w.execute('UPDATE food_logs SET food_id = ? WHERE food_id = ?', [data.id, op.id]);
    await w.execute('DELETE FROM foods WHERE id = ?', [op.id]); // el DELETE que sube no matchea nada en el servidor
  });
  emitSyncNotice('merged', `"${data.name}" ya estaba guardado en otro dispositivo. Unificamos tus registros.`);
  return true;
}

export const connector = new SupabaseConnector();
