# Kommo — Exploración de endpoints (Fase 1)

> Resultado de correr `scripts/explore-kommo.ts` contra la cuenta **REAL**
> (`mooneyatkinson`, account_id `33858347`) con el Bearer token de la integración
> privada. Objetivo: confirmar qué responde cada endpoint y con qué forma, antes de
> construir el alta automática de BM. **No se construyó nada productivo todavía.**

Fecha de la corrida: 2026-06-26.

| # | Endpoint | Método | Status | ¿Sirve para el alta automática? |
|---|----------|--------|--------|----------------------------------|
| 1 | `/api/v4/leads/pipelines` | GET | **200** | ✅ Crear pipeline + etapas (público, estable) |
| 2 | `/api/v4/leads/custom_fields/1227432` | GET | **200** | ✅ Campo `PLANTILLA_ENVIADA` confirmado |
| 2b | `/api/v4/account?with=amojo_id` | GET | **200** | ℹ️ `amojo_id` para la Chats API |
| 3a | `/api/v4/sources` | GET | **204** | ⚠️ Vacío: NO lista canales de WhatsApp |
| 3b | `/api/v4/chats/sources` | GET | **404** | ❌ No existe bajo `/api/v4` |
| 4a | `/api/v4/salesbot` | GET | **404** | ❌ Los bots no viven en `/api/v4` |
| 4b | `/api/v4/salesbots` | GET | **404** | ❌ Idem |

---

## (1) Pipelines y etapas — `GET /api/v4/leads/pipelines` → 200 ✅

La cuenta tiene **22 pipelines** (`_total_items: 22`). Devuelve cada pipeline con sus
statuses embebidos. Forma de un **status** (lo que tendremos que crear al dar de alta un BM):

```json
{
  "id": 94051815,
  "name": "Leads Entrantes",
  "sort": 10,
  "is_editable": false,
  "pipeline_id": 12175667,
  "color": "#c1c1c1",
  "type": 1,
  "account_id": 33858347
}
```

Notas para la creación:
- `type`: `1` = etapa de entrada (incoming/unsorted), `0` = etapa normal. Las etapas
  "ganado/perdido" usan ids reservados (`142`/`143`). Para BM nuevo creamos etapas `type: 0`
  (ENVÍO, SI, NO, ERROR) + la base de origen.
- `color` y `sort` son libres; conviene replicar el patrón visual de BM3.
- La creación de pipeline+etapas en un solo POST a `/api/v4/leads/pipelines` (con
  `_embedded.statuses`) es el camino documentado y estable.

## (2) Campo `PLANTILLA_ENVIADA` — `GET /api/v4/leads/custom_fields/1227432` → 200 ✅

```json
{
  "id": 1227432,
  "name": "PLANTILLA_ENVIADA",
  "type": "text",
  "code": null,
  "entity_type": "leads",
  "is_predefined": false,
  "is_deletable": true
}
```

Confirmado: es el campo único que usa el bot (`{{lead.cf.1227432}}`). `type: text`,
`code: null` (se referencia por **id**, no por code). **No cambia entre BMs** → no hay que
crearlo por BM; ya existe y se reutiliza.

## (2b) Cuenta — `GET /api/v4/account?with=amojo_id` → 200 ℹ️

```json
{ "id": 33858347, "subdomain": "mooneyatkinson", "amojo_id": "e23e6d0b-6486-4c2e-9f4a-050b99d7f8bd" }
```

El `amojo_id` es la clave de la cuenta en el servicio **amoJo** (chats). Es necesario para
hablar con la Chats API, que es donde probablemente viven los canales de WhatsApp (ver (3)).

## (3) Canales de WhatsApp (chat sources) — ⚠️ NO resueltos por v4

- `GET /api/v4/sources` → **204 No Content**. El endpoint existe pero está **vacío**: lista
  las "sources" del pipeline digital (formularios, etc.), **no** los canales de chat. No
  aparece el `id: 59026` que necesita el bot.
- `GET /api/v4/chats/sources` → **404** (el router lo reescribe a `/chats/sources` fuera de
  `/api/v4`): no existe en la API pública v4.

**Conclusión:** el `chat_source id` del WhatsApp (BM3 = `59026`) **no es descubrible con el
Bearer token v4**. Los canales de chat viven en la **Chats API (amoJo)**, que usa otra base
(`https://amojo.kommo.com`) y **otro esquema de auth** (channel secret + firma HMAC-SHA1,
no el Bearer token). Tenemos el `amojo_id`, pero falta el `scope_id`/secret del canal.

→ **Decisión pendiente** (ver abajo). Es el punto más bloqueante para el "alta 100% auto".

## (4) Salesbots — ❌ NO en `/api/v4`

- `GET /api/v4/salesbot` → **404**
- `GET /api/v4/salesbots` → **404**

Confirmado lo previsto en el documento: la gestión de bots **no** está en la API pública v4.
Vive en la **API interna del front** (`https://mooneyatkinson.kommo.com/ajax/...`), no
documentada y sujeta a cambios sin aviso. No se siguió adivinando (como indica el plan).

---

## Resumen para decidir antes de la Fase 2

**Lo que SÍ podemos automatizar hoy con API pública estable:**
- ✅ Crear el **pipeline + etapas** (ENVÍO, SI, NO, ERROR, base) → IDs para `bm_config`.
- ✅ Reutilizar el campo `PLANTILLA_ENVIADA` (ya existe, id fijo).
- ✅ Autocompletar el registro `bm_config` con los IDs devueltos por Kommo.

**Lo que NO está resuelto y necesita decisión:**
1. **Canal de WhatsApp (`chat_source id`)** — no se obtiene por v4. Opciones a evaluar:
   - (a) Usar la **Chats API (amoJo)** con channel secret/scope (requiere registrar/obtener
     el canal y firmar requests). Más trabajo, pero es "oficial-ish".
   - (b) Endpoint **interno** del front para listar canales (frágil, aislado en
     `src/kommo/salesbot.ts`).
   - (c) **Paso manual mínimo**: que el usuario pegue el `chat_source id` una vez al dar de
     alta (lo ve en Kommo). Degradación pragmática, mantiene el resto automático.
2. **Clonación del Salesbot** — sólo vía API interna (`/ajax/...`). Opciones:
   - (a) Implementarla aislada en `src/kommo/salesbot.ts`, asumiendo el riesgo de cambios.
   - (b) **Degradar a semi-manual**: el usuario clona el bot a mano (1 paso) y Sender IO
     sustituye los IDs vía la misma API interna, o le entrega los valores a pegar.

**Recomendación para charlar:** avanzar la Fase 2 con lo estable (pipeline+etapas+campo+
`bm_config`), y tratar **canal** y **bot** como un track aparte donde primero probamos la
viabilidad real de la Chats API / endpoints internos antes de comprometer el "alta 100% auto".
