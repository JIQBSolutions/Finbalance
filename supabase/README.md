# Cambios de base de datos

La app usa el proyecto Supabase configurado mediante variables de entorno. Antes
de publicar una versión que incluya edición o eliminación de cuentas y metas,
aplica las migraciones de `supabase/migrations` al proyecto correspondiente.

Con Supabase CLI enlazado al proyecto:

```bash
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

La migración de administración de cuentas:

- valida que el usuario autenticado sea dueño del workspace;
- conserva el historial cuando cambia un saldo creando un check-in manual;
- elimina cuentas de forma lógica mediante `is_active = false`;
- habilita la eliminación de metas sólo dentro de workspaces propios.

Después de aplicarla, fuerza la recarga del esquema REST desde el dashboard de
Supabase si PostgREST aún no reconoce las funciones nuevas.
