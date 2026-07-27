# Cobertura funcional y preparación de producto

Fecha de revisión: 2026-07-27

## Alcance de la revisión

El repositorio no incluía un PRD versionado. Esta matriz toma como fuente los
flujos ya definidos por la aplicación y los requisitos explícitos solicitados:
cuentas financieras editables, metas editables y eliminables, funcionalidades
pendientes y preparación para deploy.

| Área | Requisito observable | Estado |
| --- | --- | --- |
| Autenticación | Registro con validación | Cubierto |
| Autenticación | Confirmación de correo antes del onboarding | Cubierto |
| Autenticación | Inicio y cierre de sesión | Cubierto |
| Autenticación | Recuperación y cambio de contraseña | Cubierto |
| Perfil | Consulta y edición de nombre | Cubierto |
| Workspaces | Alta, selección, edición y archivado | Cubierto |
| Cuentas | Alta de banco, efectivo, inversión y deuda | Cubierto |
| Cuentas | Edición de nombre, tipo y saldo | Cubierto |
| Cuentas | Eliminación sin perder historial | Cubierto |
| Check-in | Actualización de saldos operativos | Cubierto |
| Dashboard | Balance, patrimonio, distribución y tendencias | Cubierto |
| Historial | Resumen, filtros y detalle por snapshot | Cubierto |
| Metas | Alta y actualización de avance | Cubierto |
| Metas | Edición completa de datos | Cubierto |
| Metas | Completar, reabrir y eliminar | Cubierto |
| Deudas | Aparición automática en el panel de metas | Cubierto |
| Deudas | Registro de abonos con actualización del saldo real | Cubierto |
| Deudas | Plan editable y cálculo semanal/mensual por plazo | Cubierto |
| Deudas | Historial del último abono y progreso acumulado | Cubierto |
| Deploy | Variables documentadas y no versionadas | Cubierto |
| Deploy | Migración para nuevas operaciones | Cubierto |
| Deploy | Configuración de export web y EAS | Cubierto |
| Calidad | Typecheck y export estático repetibles | Cubierto |

## Decisiones de integridad

- Cambiar el saldo de una cuenta crea un check-in `manual_update`; no reescribe
  snapshots anteriores.
- Eliminar una cuenta es un archivado lógico. El historial conserva el nombre y
  sus snapshots.
- Eliminar una meta es permanente y requiere confirmación.
- Las operaciones privilegiadas de cuentas validan propiedad del workspace en
  Supabase, no sólo en la interfaz.
- Cada abono de deuda crea un snapshot y un registro de pago dentro de una misma
  operación de Supabase; el historial y el saldo no pueden quedar desfasados.
- El monto semanal y mensual recomendado se recalcula con el saldo actual y los
  días restantes hasta la fecha límite configurada.

## Dependencias externas antes de producción

- Aplicar las migraciones al proyecto Supabase de producción.
- Registrar los redirect URLs de recuperación de contraseña en Supabase Auth.
- Confirmar que `com.jiqbsolutions.finbalance` sea el identificador definitivo.
- Definir las variables públicas de Supabase en el proveedor web y en EAS.
- Ejecutar un smoke test autenticado contra el proyecto de producción o staging.

Si existe un PRD fuera del repositorio, debe añadirse o enlazarse aquí para
convertir esta matriz en una trazabilidad requisito por requisito.
