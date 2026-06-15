---
title: Sincronización saliente
order: 13
icon: RiUploadCloud2Line
summary: Envía automáticamente los secretos de un entorno a las variables de entorno de una plataforma cloud (Vercel, Render, Railway) en cada cambio.
---

# Sincronización saliente

La **sincronización saliente** envía los secretos de un entorno de Physalis a las
**variables de entorno** de una plataforma cloud (Vercel, Render, Railway),
automáticamente **en cada cambio** de un secreto.

Es lo **contrario** del [despliegue OIDC](07-despliegue-oidc):

| | Despliegue OIDC | Sincronización saliente |
|---|---|---|
| **Quién aloja la app** | tu VPS | la plataforma (Vercel/Render/Railway) |
| **Sentido** | la plataforma pide, Physalis responde | Physalis envía a la plataforma |
| **Rol de Physalis** | provee secretos **y** despliega | **alimenta** secretos; la plataforma despliega |

Usas uno **u** otro para una app dada — no ambos.

## Principio

- **Physalis es la fuente de verdad.** Envía sus secretos a la plataforma; **nunca**
  lee en sentido inverso. Una variable creada a mano en la plataforma **no aparece**
  en Physalis.
- La sincronización es **unidireccional** y **automática**: cada creación /
  modificación / eliminación / rotación de un secreto dispara un envío.
- Una **sincronización inicial** se lanza al crear el destino.

## Configuración — 2 pasos

### 1. Conexión (nivel organización)

En **Organización → pestaña CI/CD → Nueva conexión**, elige el proveedor de sync e
introduce su **token** (cifrado, nunca se vuelve a mostrar — *solo escritura*):

| Proveedor | Token a aportar | Dónde crearlo |
|---|---|---|
| **Vercel** | Token de acceso | Account Settings → Tokens (+ *Team ID* si el proyecto está en una Team) |
| **Render** | Clave API | Account Settings → API Keys |
| **Railway** | **Token de cuenta / workspace** | Account Settings → Tokens |

> ⚠️ **Railway**: usa un **token de cuenta** (o workspace), **no** un *project token*
> (este último usa una cabecera distinta y sería rechazado).

Una conexión es **compartida** por todos los proyectos de la organización. Reservado
a los roles **ADMIN_DEV+**.

### 2. Destino (nivel entorno)

En un **proyecto → un entorno → subpestaña Sync → Nuevo destino** (reservado al rol
**OWNER** del proyecto):

1. elige la **conexión**;
2. el **selector** lista los recursos accesibles por el token:
   - **Vercel**: el **proyecto** Vercel + los **entornos destino** (production /
     preview / development, casillas);
   - **Render**: el **servicio**;
   - **Railway**: en cascada **proyecto → entorno → servicio**;
3. (opcional) un **filtro por tag**: enviar solo los secretos con al menos uno de
   esos tags. Vacío = **todos** los secretos del entorno.

> La subpestaña **Sync** solo aparece si la organización tiene al menos una conexión
> de sync.

## Comportamiento por plataforma

### Vercel
- Variables enviadas con tipo **`encrypted`** (cifradas en reposo, legibles por
  builds/functions, compatibles con dev/preview/production).
- **Upsert**: creación + actualización idempotentes.
- **Eliminación reconciliada**: un secreto borrado en Physalis se quita en Vercel.
  Physalis solo toca las variables que gestiona (marcadas con un comentario
  `physalis-sync`) → **tus variables manuales en Vercel se conservan**.

### Render & Railway — reemplazo total
- Estas plataformas **reemplazan la totalidad** de las variables del servicio en una
  sola llamada.
- Consecuencia: **Physalis pasa a ser la fuente de verdad del servicio** — una
  variable puesta a mano en la plataforma y **ausente** de Physalis será
  **eliminada** en el siguiente envío. Se muestra un aviso al crear el destino.
- Railway **redespliega automáticamente** el servicio en cada cambio de variable.

## Seguimiento y operaciones

- **Estado**: cada destino muestra `sincronizado <fecha>` (verde) o el error de la
  última sync (`lastSyncError`, mensaje saneado).
- **Resync manual**: botón *Resync* en el destino (reenvía el estado actual).
- **Eliminación de destino**: al eliminar, puedes pedir la **limpieza de las
  variables remotas** gestionadas por Physalis (offboarding).
- **Cron de reconciliación** (opcional): un endpoint `/api/cron/sync-reconcile`
  reenvía los destinos en error (tras un incidente transitorio de la plataforma).
  Dispáralo periódicamente (p. ej. vía n8n, cada 30 min).

## Seguridad

- **Token solo escritura**: el token de la plataforma nunca se vuelve a mostrar ni es
  legible una vez guardado (cifrado AES-256-GCM).
- **Alcance acotado**: solo puedes apuntar a recursos que el token ya posee (el
  selector los lista vía la API de la plataforma).
- **Filtro por tag** para no enviar secretos backend a una plataforma frontend.
- **Fuente de verdad**: un cambio hecho directamente en la plataforma sobre una
  variable gestionada por Physalis será **sobrescrito** en el siguiente envío.

## Límites

- Sincronización **unidireccional** (Physalis → plataforma). Sin importación desde la
  plataforma.
- En **Render** y **Railway**, Physalis posee la totalidad de las variables del
  servicio destino (reemplazo en bloque).
