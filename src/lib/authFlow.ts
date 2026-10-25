// Mientras se recupera la contraseña, verifyOtp ya inicia sesión: este flag frena el cambio de pantalla
// hasta que la contraseña nueva quedó guardada.
import { useSyncExternalStore } from 'react';

let resetting = false;
const subs = new Set<() => void>();

export function setPasswordResetting(v: boolean) {
  resetting = v;
  subs.forEach((f) => f());
}

export function usePasswordResetting() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    () => resetting,
  );
}

export function authErrorEs(msg: string) {
  if (/invalid login/i.test(msg)) return 'Email o contraseña incorrectos.';
  if (/already registered|already been registered/i.test(msg)) return 'Ese email ya tiene cuenta.';
  if (/email not confirmed/i.test(msg)) return 'Falta confirmar el email: cargá el código que te llegó.';
  if (/expired|invalid.*(otp|token)|token.*(expired|invalid)/i.test(msg)) return 'El código venció o no es correcto. Pedí otro.';
  if (/rate limit|too many|security purposes/i.test(msg)) return 'Demasiados intentos. Esperá un minuto y probá de nuevo.';
  if (/should be different|same password/i.test(msg)) return 'La contraseña nueva tiene que ser distinta de la anterior.';
  if (/weak|at least/i.test(msg)) return 'La contraseña es muy débil: usá al menos 8 caracteres.';
  if (/network|fetch/i.test(msg)) return 'Sin conexión. Probá de nuevo con señal.';
  return msg;
}

export const validEmail = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());
export const validCode = (c: string) => /^\d{6,10}$/.test(c.trim());
