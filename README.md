# Finbalance

Finbalance es una aplicación móvil de control financiero para profesionistas independientes y pequeños negocios que necesitan conocer cuánto dinero tienen disponible, cómo está evolucionando su negocio y cuánto están generando realmente.

La propuesta principal de Finbalance es simple:

> Conoce cuánto gana realmente tu negocio.

Y su propuesta secundaria:

> Separa tus finanzas personales de las de tu negocio.

---

## Objetivo del proyecto

Finbalance busca simplificar la administración financiera para personas que no quieren o no pueden mantener hojas de cálculo complejas.

A diferencia de muchas apps financieras tradicionales, Finbalance no obliga al usuario a registrar cada ingreso o gasto. En su lugar, utiliza un sistema de actualizaciones periódicas de saldo llamado **Check-In Financiero**.

El usuario registra cuánto dinero tiene actualmente en sus cuentas principales y la app calcula la evolución financiera del negocio.

---

## Usuario objetivo

Finbalance está pensado principalmente para:

* Profesionistas independientes
* Consultores
* Arquitectos
* Abogados
* Contadores
* Diseñadores
* Psicólogos
* Médicos
* Freelancers
* Pequeños negocios de servicios

También puede adaptarse a pequeños negocios físicos como barberías, cafeterías, talleres o tiendas pequeñas.

---

## Funcionalidades principales de la V1

### Workspaces

Un usuario puede tener múltiples espacios financieros independientes.

Ejemplos:

* Personal
* Consultoría
* Barbería Central
* Despacho Jurídico

Cada workspace tiene sus propias cuentas, saldos, objetivos y reportes.

---

### Cuentas

Cada workspace puede tener múltiples cuentas.

Tipos de cuenta:

* Banco
* Efectivo / Caja
* Crédito / Deuda
* Ahorro / Inversión

Las cuentas bancarias y de efectivo participan en los Check-Ins.

Las cuentas de crédito, deuda, ahorro e inversión se manejan manualmente y se muestran por separado.

---

### Check-In Financiero

El Check-In Financiero es el núcleo de Finbalance.

En lugar de registrar cada movimiento, el usuario actualiza los saldos actuales de sus cuentas operativas.

Ejemplo:

* BBVA: $15,000
* Caja: $3,000
* Nu: $8,000

La app compara esos saldos contra el último Check-In y calcula el cambio financiero del negocio.

---

### Dashboard

El dashboard muestra la información más importante del negocio.

Métrica principal:

* Dinero disponible

Métricas secundarias:

* Cambio desde la última actualización
* Cambio mensual
* Ahorros e inversiones
* Deudas y créditos

---

### Objetivos financieros

Finbalance permite registrar objetivos financieros como:

* Metas de ahorro
* Deudas
* Préstamos
* Fondos de emergencia

Los objetivos financieros son herramientas de planificación y no afectan automáticamente el dinero disponible del workspace.

---

### Transacciones opcionales

Finbalance puede permitir registrar movimientos específicos, pero este módulo es secundario.

La app no depende de transacciones para funcionar.

---

## Filosofía del producto

Finbalance se construye bajo estos principios:

* Menos esfuerzo, más claridad.
* No exigir disciplina excesiva al usuario.
* Evitar convertir la app en un ERP.
* Priorizar información financiera útil sobre contabilidad compleja.
* Diseñar primero para México y Latinoamérica.
* Mantener la experiencia simple, rápida y móvil.

---

## Funcionalidades fuera de alcance en V1

La primera versión no incluirá:

* Facturación SAT
* Inventario
* Nómina
* Empleados
* CRM
* OCR
* Inteligencia artificial
* Integraciones bancarias
* Presupuestos avanzados
* Roles avanzados
* Multi-moneda avanzada

Estas funciones podrían evaluarse en versiones futuras.

---

## Stack previsto

### Frontend

* Expo
* React Native
* TypeScript
* Expo Router

### Backend

* Supabase
* PostgreSQL
* Supabase Auth
* Row Level Security

### Estado global

* Zustand

### Validaciones

* Zod
* React Hook Form

---

## Estado actual

El proyecto se encuentra en fase inicial de arquitectura y desarrollo.

Ya se definieron:

* Propuesta de valor
* Usuario objetivo
* Modelo multiworkspace
* Sistema de Check-Ins
* Tipos de cuenta
* Esquema base de Supabase
* Alcance de la V1

---

## Roadmap inicial

### Fase 1

* Configuración del proyecto Expo
* Configuración de Supabase
* Autenticación
* Estructura base de navegación

### Fase 2

* Onboarding
* Creación de workspace
* Creación de cuentas iniciales
* Check-In inicial

### Fase 3

* Dashboard
* Métricas principales
* Historial de Check-Ins

### Fase 4

* Objetivos financieros
* Ahorros
* Deudas

### Fase 5

* Transacciones opcionales
* Reportes simples

---

## Autor

Proyecto desarrollado por Jaime Ivan Quezada Beltran.

---

## Nota

Finbalance es un proyecto en desarrollo activo.
La arquitectura y funcionalidades pueden cambiar conforme se valide el producto con usuarios reales.
