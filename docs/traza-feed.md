# GET /traza/v1/feed — SenderIO → Control

Contrato Traza v1 (MSG-TRZ-20260917-SND-1). **No** es el ingest viejo
`POST /api/v1/spam/*`. El push a programa-trazabilidad queda **prendido**
(dual-run) hasta que Control confirme 200 y cruce cantidades.

## Path prod

`https://senderio-production.up.railway.app/traza/v1/feed`

## Auth

`Authorization: Bearer <TRAZA_FEED_TOKEN>` (scope `traza:feed`). Lo carga CRED
en SenderIO y el mismo valor en Control. Sin pegar el token.

- Sin `TRAZA_FEED_TOKEN` → `503 { ok:false, error:"feed_disabled" }`
- Bearer malo → `401 { ok:false, error:"unauthorized" }`
- `types` inválido → `400 { ok:false, error:"invalid_types" }`

## Query

`since`, `cursor`, `types` (`senderio.envio,senderio.plantilla`), `limit`
(default 100, max 500). `store` no aplica (siempre `null`).

Envelope: `{ program:"senderio", generatedAt, store:null, cursor, hasMore, items[] }`  
item: `{ type, id, ts, telefono, payload }`

- `senderio.envio` — `id = message_id = senderio:{BM}:{leadId}`
- `senderio.plantilla` — `id` = `template_nombre`

Payload envío: claves camelCase siempre presentes (ausente → `null`).
**No** incluye `mensajeEnviado` (el texto va en `senderio.plantilla`).

2ª página del mismo type no solapa la 1ª.

## Cobertura local

- Envíos en esta DB: **2026-05-16 → hoy**.
  Merge n8n (MSG-TRZ-20260917-DUMP-SND) + era SenderIO. Idempotente por `message_id`.
  Drenaje local: **9558** `senderio.envio` únicos (4757 dump + 4895 locales − 94 solape).
- Plantillas: 13 nombres únicos (el dump traía 32 items / 13 nombres; ya estaban).
- `template_nombre` vacío en el tramo n8n: aceptado (n8n no lo registró).
- Dual-run: push al Railway viejo sigue ON.
