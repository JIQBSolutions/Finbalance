# Finbalance

Finbalance es una app Expo para conocer la posición financiera real de un
negocio o de las finanzas personales a partir de snapshots de saldo. Permite
trabajar con varios espacios financieros, registrar cuentas, hacer check-ins,
consultar tendencias e historial y administrar metas de ahorro o pago de deuda.

## Funcionalidades

- Registro, inicio de sesión, confirmación de correo y recuperación de contraseña.
- Perfil editable y cambio de contraseña.
- Workspaces personales o de negocio, con selección, edición y archivado.
- Cuentas bancarias, efectivo, inversiones y deudas con alta, edición y
  eliminación lógica.
- Check-ins operativos que conservan el historial de saldos.
- Dashboard con balance, patrimonio, distribución y variaciones.
- Historial filtrable con detalle por cuenta.
- Metas de ahorro o deuda con creación, edición completa, actualización de
  avance, finalización, reapertura y eliminación.
- Deudas vinculadas al saldo real de sus cuentas, con planes por fecha límite,
  abonos registrados e importes recomendados por semana y por mes.

## Requisitos

- Node.js 20.19 o superior.
- Un proyecto Supabase con el esquema base de Finbalance.
- Supabase CLI para aplicar migraciones.
- Una cuenta Expo/EAS para generar builds móviles.

## Configuración local

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env` y configura:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=TU_CLAVE_ANON_PUBLICA
   ```

3. Aplica las migraciones descritas en `supabase/README.md`.

4. Inicia la app:

   ```bash
   npm run web
   ```

   Para dispositivo también puedes usar `npm run android` o `npm run ios`.

## Verificación

```bash
npm run typecheck
npm run build:web
```

`npm run check` ejecuta ambas verificaciones en secuencia.

## Deploy web

Genera el sitio estático:

```bash
npm run build:web
```

Publica el contenido de `dist/` en un proveedor de hosting estático y configura
una regla de fallback hacia `index.html` para las rutas de Expo Router.

En Supabase Auth agrega las URL públicas permitidas:

- `https://TU_DOMINIO/auth/update-password`
- el scheme nativo `finbalance://auth/update-password`

Configura las dos variables `EXPO_PUBLIC_*` también en el entorno de build del
proveedor.

## Builds móviles con EAS

Después de autenticarte con Expo:

```bash
eas build:configure
eas build --platform all --profile production
```

El identificador inicial configurado es `com.jiqbsolutions.finbalance`. Si la
organización usa otro dominio, cámbialo en `app.json` antes del primer build que
se publique en tiendas.

## Seguridad

Las variables `EXPO_PUBLIC_*` se incluyen en el bundle y nunca deben contener
una `service_role` key. La seguridad de los datos depende de RLS y de las
funciones autenticadas de Supabase. No publiques `.env`.
