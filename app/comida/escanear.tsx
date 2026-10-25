import { usePowerSync } from '@powersync/react';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lookupBarcode, type OffFood } from '@/lib/off';
import { findFoodByBarcode, upsertOffFood } from '@/nutrition/data';
import { gutter, line, palettes, space } from '@/theme';
import { Button, Header, Screen, Text, ThemeScope } from '@/ui';

// Sobre la cámara siempre paleta oscura, en los dos temas
const colors = palettes.dark;

type State = { busy: boolean; msg: string | null };

export default function Escanear() {
  const { meal = 'snack', date = '' } = useLocalSearchParams<{ meal?: string; date?: string }>();
  const db = usePowerSync();
  const [perm, requestPerm] = useCameraPermissions();
  const [st, setSt] = useState<State>({ busy: false, msg: null });
  const [lastCode, setLastCode] = useState<string | null>(null);
  const locked = useRef(false);

  const toPortion = (foodId: string) => router.replace({ pathname: '/comida/porcion', params: { foodId, meal, date } });
  const toNew = (code: string, partial?: OffFood | null, missing?: string[]) => router.replace({
    pathname: '/comida/nuevo',
    params: {
      barcode: code, meal, date,
      name: partial?.name ?? '', brand: partial?.brand ?? '',
      // solo lo que vino de verdad; lo faltante queda vacío para completar
      kcal: partial && !missing?.includes('calorías') ? String(partial.kcal_100g) : '',
      p: partial && !missing?.includes('proteínas') ? String(partial.protein_100g) : '',
      c: partial && !missing?.includes('carbohidratos') ? String(partial.carbs_100g) : '',
      g: partial && !missing?.includes('grasas') ? String(partial.fat_100g) : '',
      serving: partial?.serving_g ? String(partial.serving_g) : '',
      missing: missing?.join(', ') ?? '',
    },
  });

  async function onScan({ data }: BarcodeScanningResult) {
    if (locked.current) return;
    locked.current = true;
    const code = data.trim();
    setLastCode(code);
    try {
      // 1) ya escaneado antes: sirve sin señal
      const local = await findFoodByBarcode(db, code);
      if (local) return toPortion(local.id);

      // 2) Open Food Facts
      setSt({ busy: true, msg: `Buscando ${code}…` });
      const r = await lookupBarcode(code);
      if (r.kind === 'found') return toPortion(await upsertOffFood(db, r.food));
      if (r.kind === 'incomplete') return toNew(code, r.partial, r.missing);
      if (r.kind === 'not_found') return toNew(code);
      setSt({
        busy: false,
        msg: r.kind === 'offline'
          ? 'Sin señal. Cargalo a mano: queda guardado para la próxima.'
          : `Open Food Facts no responde (${r.status}). Probá de nuevo o cargalo a mano.`,
      });
    } catch {
      setSt({ busy: false, msg: 'No se pudo leer el código. Probá de nuevo.' });
    }
  }

  function retry() { locked.current = false; setSt({ busy: false, msg: null }); }

  if (!perm) return <Screen><Header title="Cámara" /></Screen>;
  if (!perm.granted) {
    return (
      <Screen>
        <Header label="Escanear" title="Necesito la cámara" />
        <Text variant="body" tone="secondary">
          {perm.canAskAgain
            ? 'Solo para leer el código de barras. No se guarda ninguna foto.'
            : 'El permiso de cámara está desactivado. Activalo en los ajustes del teléfono.'}
        </Text>
        <Button variant="primary" label={perm.canAskAgain ? 'Dar permiso' : 'Abrir ajustes'}
          onPress={() => (perm.canAskAgain ? requestPerm() : Linking.openSettings())} style={{ marginTop: space.xl }} />
        <Button variant="ghost" label="Cargar a mano" style={{ marginTop: space.sm }}
          onPress={() => router.replace({ pathname: '/comida/nuevo', params: { meal, date } })} />
      </Screen>
    );
  }

  return (
    <ThemeScope scheme="dark">
    <StatusBar style="light" />
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={st.busy || st.msg ? undefined : onScan}
      />
      <SafeAreaView edges={['top', 'bottom']} style={styles.overlay} pointerEvents="box-none">
        <Text variant="label" style={{ color: colors.text }}>Apuntá al código de barras</Text>
        {/* marco de 1 px, sin color */}
        <View style={styles.frame} />
        <View style={styles.bottom}>
          {st.busy ? <ActivityIndicator color={colors.text} /> : null}
          {st.msg ? <Text variant="small" style={{ color: colors.text, textAlign: 'center' }}>{st.msg}</Text> : null}
          {!st.busy && st.msg ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, alignSelf: 'stretch' }}>
              <Button label="Reintentar" onPress={retry} style={{ backgroundColor: colors.bg, flexGrow: 1, flexShrink: 1 }} />
              <Button label="Cargar a mano" onPress={() => toNew(lastCode ?? '')} style={{ backgroundColor: colors.bg, flexGrow: 1, flexShrink: 1 }} />
            </View>
          ) : null}
          {!st.busy ? (
            <Button variant="ghost" label="Cancelar" onPress={() => router.back()} />
          ) : null}
        </View>
      </SafeAreaView>
    </View>
    </ThemeScope>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: gutter, paddingVertical: space.xl },
  frame: { width: '86%', aspectRatio: 1.8, borderWidth: line, borderColor: colors.text },
  bottom: { minHeight: 96, alignItems: 'center', gap: space.sm },
});
