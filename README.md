<p align="center"><img src="docs/icono.png" width="120" alt="Bro?"></p>

# Bro? — app de gimnasio offline-first

App Android para entrenar que **arma la rutina sola según tu objetivo**, registra cada serie con RIR/RPE, te dice **cuánto subir la próxima vez**, cuenta calorías escaneando el código de barras y, en **Modo cámara**, **cuenta tus repeticiones con visión artificial** mientras entrenás.

Funciona **sin señal** (en el gimnasio casi nunca hay) y sincroniza sola cuando vuelve la conexión. La usamos con amigos; se distribuye como APK.

## Funcionalidades

- 🏋️ **Constructor automático de rutinas** según objetivo, días disponibles y equipamiento, con superseries. 12 métodos de entrenamiento (Heavy Duty, FST-7, 5/3/1, etc.) y 40 plantillas.
- 📈 **Motor de progresión**: calcula el e1RM, sugiere peso y repeticiones para la próxima sesión, maneja deloads y mesociclos.
- 💪 **Niveles de fuerza** (bajo / intermedio / alto) en banca, sentadilla y peso muerto, ajustados por peso corporal y altura.
- 📚 **877 ejercicios** importados de [free-exercise-db](https://github.com/yuhonas/free-exercise-db) con las instrucciones **traducidas al español**, imágenes y sustitutos.
- 📷 **Modo cámara**: detección de pose en el teléfono (módulo nativo propio `bro-pose`), cuenta repeticiones, arranca el descanso solo y marca errores de técnica. No se guarda ni se sube ninguna imagen.
- 🍎 **Nutrición**: contador de calorías y macros con escaneo de código de barras (Open Food Facts), objetivos semanales con ajuste automático.
- 📴 **Offline-first** con PowerSync: base SQLite local que se sincroniza con Postgres.
- 🌗 Tema claro/oscuro, color de acento, animaciones y notificaciones locales de fin de descanso.

## En números

- **Backend Supabase con 26 tablas, todas con Row Level Security** (11 migraciones versionadas).
- **877 ejercicios** traducidos, **12 métodos**, **40 plantillas** de rutina.
- Pipeline de **builds Android (EAS)** con **actualizaciones OTA**.

## Stack

| Capa | Tecnología |
|---|---|
| App | **Expo SDK 58**, **React Native 0.88**, expo-router, TypeScript |
| Offline / sync | **PowerSync** + op-sqlite |
| Backend | **Supabase**: Postgres, Auth (códigos OTP por mail), RLS |
| Visión | expo-camera + módulo nativo propio (`modules/bro-pose`, ML Kit Pose) |
| Datos externos | Open Food Facts, free-exercise-db |
| Builds | EAS Build (APK) y EAS Update (OTA) |

## Estructura

```
app/                 pantallas (expo-router)
src/builder/         armado automático de rutinas
src/lib/             progresión, e1RM, niveles de fuerza, nutrición
src/workout/         sesión de entrenamiento, superseries, modo cámara
src/db/              esquema local, conector Supabase ↔ PowerSync
modules/bro-pose/    módulo nativo de detección de pose
supabase/migrations/ esquema SQL, seeds de métodos y niveles
powersync/           sync rules
scripts/             importador del catálogo de ejercicios, tests
```

## Cómo correrlo

> Necesita **development build**: op-sqlite y el modo cámara no corren en Expo Go.

```bash
npm install
npm run setup            # alinea las libs nativas con el SDK
cp .env.example .env     # completá con TU Supabase y TU PowerSync
npx expo prebuild
npm run android
```

### Backend

1. **Supabase**: creá un proyecto y corré las migraciones de `supabase/migrations/` en orden (`supabase db push`). La 004 crea la publicación para PowerSync.
2. Creá el rol de replicación (comentado al final de la migración 004).
3. **PowerSync**: conectá la base, habilitá Supabase Auth y pegá `powersync/sync-rules.yaml`.
4. **Catálogo de ejercicios** (opcional):
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-free-exercise-db.mjs
   ```
   La service role key se usa solo en tu máquina; nunca va en la app ni en el repo.
5. **Auth → Email Templates**: la app confirma la cuenta y recupera la contraseña con **código** (`{{ .Token }}`), no con link.

### APK

```bash
eas build -p android --profile production   # genera un APK
```

## Privacidad

El repositorio no incluye `.env`, contraseñas, keystores ni datos de usuarios. Las claves van por variables de entorno (ver `.env.example`).

---

Hecho por [Lucas](https://github.com/ttt13412014) · Córdoba, Argentina
