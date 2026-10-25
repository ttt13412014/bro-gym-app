import { usePowerSync, useQuery } from '@powersync/react';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { localIso } from '@/lib/nutrition';
import { useToday } from '@/lib/useToday';
import { LogRow, MacroRow } from '@/nutrition/components';
import { MEALS, applyCheckin, deleteLog, evaluateLastWeek } from '@/nutrition/data';
import { space } from '@/theme';
import { Button, Header, Row, Screen, Section, Text, confirmDestructive, dimWhenPressed, useRipple } from '@/ui';

type Target = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
type Log = { id: string; meal: string; food_name: string; grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number };
type Pending = NonNullable<Awaited<ReturnType<typeof evaluateLastWeek>>>;

const shift = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localIso(d);
};

export default function Comida() {
  const db = usePowerSync();
  const ripple = useRipple();
  // null = hoy: sigue al reloj (si la app queda abierta pasada la medianoche no se queda en ayer)
  const todayIso = useToday();
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? todayIso;
  const setDate = (d: string) => setPicked(d === todayIso ? null : d);
  const [pending, setPending] = useState<Pending | null>(null);
  const applying = useRef(false); // evita aplicar dos veces si el foco vuelve mientras corre

  const { data: profiles } = useQuery<{ id: string; auto_adjust: number }>('SELECT id, auto_adjust FROM nutrition_profiles LIMIT 1');
  const { data: targets } = useQuery<Target>(
    `SELECT kcal, protein_g, carbs_g, fat_g FROM nutrition_targets
     WHERE deleted_at IS NULL AND valid_from <= ? ORDER BY valid_from DESC, created_at DESC LIMIT 1`,
    [date],
  );
  const { data: logs } = useQuery<Log>(
    `SELECT id, meal, food_name, grams, kcal, protein_g, carbs_g, fat_g FROM food_logs
     WHERE log_date = ? AND deleted_at IS NULL ORDER BY logged_at`,
    [date],
  );
  const t = targets[0];
  const profile = profiles[0];

  // Revisión de la semana anterior: se aplica sola si el usuario lo eligió; si no, se ofrece
  useFocusEffect(useCallback(() => {
    if (!profile) return;
    let alive = true;
    if (applying.current) return;
    evaluateLastWeek(db).then(async (ev) => {
      if (!alive || !ev || ev.existing) return setPending(null);
      if (profile.auto_adjust && ev.res.adjustmentKcal !== 0) {
        applying.current = true;
        try {
          const out = await applyCheckin(db, ev, true);
          if (out.note) Alert.alert(out.applied ? 'Ajuste semanal aplicado' : 'Revisión semanal', out.note);
        } finally { applying.current = false; }
        return setPending(null);
      }
      setPending(ev.res.adjustmentKcal !== 0 ? ev : null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [profile?.id, profile?.auto_adjust]));

  const sum = (k: keyof Log) => logs.reduce((a, l) => a + Number(l[k] ?? 0), 0);
  const kcal = sum('kcal');
  const left = t ? Math.round(t.kcal - kcal) : null;
  const isToday = date === todayIso;

  function remove(l: Log) {
    confirmDestructive({
      title: 'Borrar comida',
      message: `Se borra ${l.food_name} (${Math.round(l.grams)} g · ${Math.round(l.kcal)} kcal) de este día.`,
      onConfirm: () => deleteLog(db, l.id),
    });
  }

  if (!profile) {
    return (
      <Screen>
        <Header label="Hoy" title="Comida" />
        <Text variant="body" tone="secondary">
          Para darte un objetivo de calorías y macros necesito tus datos: sexo, edad, altura, peso y actividad.
        </Text>
        <Button variant="primary" label="Calcular mis calorías" style={{ marginTop: space.xl }}
          onPress={() => router.push('/comida/perfil')} />
      </Screen>
    );
  }

  const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <Screen>
      <Header
        label={isToday ? `Hoy · ${dayLabel}` : dayLabel}
        title="Comida"
        right={
          <View style={{ flexDirection: 'row', gap: space.xs }}>
            <Pressable android_ripple={ripple} hitSlop={8} onPress={() => setDate(shift(date, -1))} accessibilityRole="button" accessibilityLabel="Día anterior"
              style={({ pressed }) => [{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, dimWhenPressed(pressed, 0.5)]}>
              <Text variant="numberSm">‹</Text>
            </Pressable>
            <Pressable android_ripple={ripple} hitSlop={8} disabled={isToday} onPress={() => setDate(shift(date, 1))} accessibilityRole="button" accessibilityLabel="Día siguiente"
              style={({ pressed }) => [{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, dimWhenPressed(pressed, 0.5)]}>
              <Text variant="numberSm" tone={isToday ? 'disabled' : 'default'}>›</Text>
            </Pressable>
          </View>
        }
      />

      {/* el número manda: lo que queda */}
      <View style={{ marginBottom: space.lg }}>
        <Text variant="label">{left != null && left < 0 ? 'Te pasaste' : 'Te quedan'}</Text>
        <Text variant="hero" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{left != null ? Math.abs(left).toLocaleString('es-AR') : '—'}</Text>
        <Text variant="small">kcal · comiste {Math.round(kcal).toLocaleString('es-AR')} de {t?.kcal.toLocaleString('es-AR') ?? '—'}</Text>
      </View>

      {isToday ? (
        <Button variant="primary" label="Escanear código" onPress={() => router.push({ pathname: '/comida/escanear', params: { meal: guessMeal() } })} />
      ) : null}

      <Section label="Macros">
        <MacroRow label="Proteína" value={sum('protein_g')} target={t?.protein_g ?? null} />
        <MacroRow label="Carbohidratos" value={sum('carbs_g')} target={t?.carbs_g ?? null} />
        <MacroRow label="Grasas" value={sum('fat_g')} target={t?.fat_g ?? null} />
      </Section>

      {pending ? (
        <Section label="Revisión semanal">
          <Row label={`${pending.res.adjustmentKcal > 0 ? '+' : ''}${pending.res.adjustmentKcal} kcal por día`}
            hint={pending.res.reason} value="→" onPress={() => router.push('/comida/semana')} />
        </Section>
      ) : null}

      {MEALS.map((m) => {
        const items = logs.filter((l) => l.meal === m.value);
        const mk = items.reduce((a, l) => a + l.kcal, 0);
        return (
          <Section key={m.value} label={items.length ? `${m.label} · ${Math.round(mk)} kcal` : m.label}>
            {items.map((l) => (
              <LogRow key={l.id} name={l.food_name} grams={l.grams} kcal={l.kcal} onLongPress={() => remove(l)} />
            ))}
            <Row label="Agregar" value="+" onPress={() => router.push({ pathname: '/comida/agregar', params: { meal: m.value, date } })} />
          </Section>
        );
      })}

      {logs.length ? (
        <Text variant="small" tone="disabled" style={{ marginTop: space.md }}>Mantené apretado un alimento para borrarlo.</Text>
      ) : null}

      <Section label="Ajustes">
        <Row label="Mis datos y objetivo" value="→" onPress={() => router.push('/comida/perfil')} />
        <Row label="Peso y revisión semanal" value="→" onPress={() => router.push('/comida/semana')} />
      </Section>
    </Screen>
  );
}

function guessMeal() {
  const h = new Date().getHours();
  if (h < 11) return 'desayuno';
  if (h < 15) return 'almuerzo';
  if (h < 19) return 'merienda';
  return 'cena';
}
