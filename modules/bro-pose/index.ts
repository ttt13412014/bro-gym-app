import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';

// Modo cámara: detección de pose en el teléfono (ML Kit, sin internet). Solo Android.
// Si el APK instalado no trae el módulo nativo, todo queda deshabilitado sin romper nada.

export type PoseFrame = {
  t: number;              // ms (reloj del teléfono)
  w: number; h: number;   // tamaño del cuadro analizado (ya rotado)
  mirrored: boolean;      // cámara frontal: la vista previa está espejada
  points: number[];       // 33 × [x, y, confianza], x/y normalizados 0..1; vacío si no hay persona
};

export type BroPoseViewProps = ViewProps & {
  facing: 'front' | 'back';
  active?: boolean;
  onPose?: (e: { nativeEvent: PoseFrame }) => void;
  onPoseError?: (e: { nativeEvent: { message: string } }) => void;
  onPoseReady?: (e: { nativeEvent: { facing: string } }) => void;
};

type NativeMod = { hasCamera(): boolean };
const mod = Platform.OS === 'android' ? requireOptionalNativeModule<NativeMod>('BroPose') : null;

let view: ComponentType<BroPoseViewProps> | null = null;
if (mod) {
  try { view = requireNativeView<BroPoseViewProps>('BroPose'); } catch { view = null; }
}

export const BroPoseView = view;
export const poseAvailable = () => !!mod && !!view;
export function hasCamera(): boolean {
  try { return !!mod?.hasCamera(); } catch { return false; }
}
