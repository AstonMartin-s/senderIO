# Cambios en el push de trazabilidad (SenderIO → programa de trazabilidad)

> Fecha: 2026-07-01 · Contacto: equipo SenderIO

Resumen para el equipo que recibe los envíos: **SenderIO dejó de mandar el cuerpo
del mensaje (`mensaje_enviado`) en el push. Ahora viaja solo `template_nombre`.**
El receptor debe reconstruir el texto del mensaje desde su propio catálogo de
plantillas usando ese nombre.

---

## 1. Qué cambió en el payload

**Endpoint (sin cambios):**

```
POST {TRAZABILIDAD_API_URL}/api/v1/spam/envios
Authorization: Bearer <TRAZABILIDAD_INGEST_API_KEY>   (si está configurada)
Content-Type: application/json
```

**Body (sin cambios de estructura):**

```json
{
  "origen": "senderio",
  "envios": [ { /* ...campos del envío... */ } ]
}
```

**El único cambio:** cada objeto de `envios` **ya NO incluye el campo
`mensaje_enviado`**. Todo lo demás se mantiene igual, incluido `template_nombre`.

### Antes

```json
{
  "fuente_envio": "crm",
  "plataforma": "mooney",
  "campaign_id_externo": "BM3",
  "campaign_nombre": "BM3",
  "template_nombre": "Spnumero3C",
  "mensaje_enviado": "Sos de los nuestros. Y eso tiene ventajas...",
  "telefono": "+5491130524873",
  "es_interno": true,
  "segmento": "Lista 3",
  "message_id": "senderio:BM3:24206464",
  "ts_enviado": "2026-07-01T18:49:46-03:00",
  "ts_entregado": null,
  "ts_leido": null,
  "ts_primera_respuesta": null,
  "estado_final": "sent",
  "error_codigo": null,
  "error_motivo": null,
  "conversacion_id": "24206464",
  "costo": 0.0618,
  "moneda": "USD"
}
```

### Ahora

```json
{
  "fuente_envio": "crm",
  "plataforma": "mooney",
  "campaign_id_externo": "BM3",
  "campaign_nombre": "BM3",
  "template_nombre": "Spnumero3C",
  "telefono": "+5491130524873",
  "es_interno": true,
  "segmento": "Lista 3",
  "message_id": "senderio:BM3:24206464",
  "ts_enviado": "2026-07-01T18:49:46-03:00",
  "ts_entregado": null,
  "ts_leido": null,
  "ts_primera_respuesta": null,
  "estado_final": "sent",
  "error_codigo": null,
  "error_motivo": null,
  "conversacion_id": "24206464",
  "costo": 0.0618,
  "moneda": "USD"
}
```

> Nota: `mensaje_enviado` simplemente **no está presente** en el JSON (no llega ni
> como `null`). El receptor debe tratarlo como opcional/ausente.

---

## 2. Qué tiene que ajustar el programa de trazabilidad

1. **No asumir que `mensaje_enviado` viene en el payload.** Si el modelo/tabla lo
   requiere, hacerlo opcional (nullable) o dejar de exigirlo en la validación de
   ingreso.
2. **Reconstruir el texto desde el catálogo de plantillas** usando
   `template_nombre` como clave (más `plataforma`/`campaign` si hace falta
   desambiguar). Los nombres son estables (ej.: `Spnumero3C`,
   `Fisioforma_2Welcome`, `Spnumero1a`).
3. **`message_id` sigue siendo la clave de idempotencia** (`senderio:<BM>:<leadId>`).
   Un mismo envío puede llegar más de una vez (push en caliente + sync de
   recuperación): deduplicar por `message_id`.

---

## 3. Motivo del cambio

El cuerpo del mensaje es idéntico para todos los envíos de una misma plantilla,
así que mandarlo en cada envío duplicaba mucha data. Enviando solo
`template_nombre` el payload es más liviano y el texto se resuelve una sola vez
del lado del receptor.

---

## 4. Campos del payload (referencia)

| Campo | Tipo | Notas |
|-------|------|-------|
| `fuente_envio` | string | `crm` (interna) \| `spam` (externa) |
| `plataforma` | string | `mooney` \| `pam` |
| `campaign_id_externo` | string | id estable de campaña (cae al id de BM si no hay uno) |
| `campaign_nombre` | string | nombre de campaña (cae al nombre/id de BM) |
| `template_nombre` | string | **nombre de la plantilla enviada (clave para reconstruir el texto)** |
| `telefono` | string | E.164, ej. `+5491130524873` |
| `es_interno` | bool | derivado de `fuente_envio` (`crm` → true) |
| `segmento` | string | etiqueta/lista del lead en Kommo (ej. `Lista 3`) |
| `message_id` | string | `senderio:<BM>:<leadId>` — **clave de idempotencia** |
| `ts_enviado` | string (ISO -03:00) | momento del envío |
| `ts_entregado` | null | no disponible (requiere webhook de delivery) |
| `ts_leido` | string\|null | se completa si el lead respondió |
| `ts_primera_respuesta` | string\|null | timestamp de SI/NO |
| `estado_final` | string | `sent` \| `failed` |
| `error_codigo` | string\|null | `3132` si falló |
| `error_motivo` | string\|null | descripción del error |
| `conversacion_id` | string | Lead ID de Kommo |
| `costo` | number\|null | `0.0618` por mensaje entregado (null si falló) |
| `moneda` | string\|null | `USD` (null si falló) |

---

## 5. Contexto: otras optimizaciones de esta tanda (no afectan al contrato)

Cambios internos de SenderIO hechos el mismo día. **No cambian el payload**, solo
mejoran rendimiento y estabilidad; se listan para referencia:

- El log de movimientos ya no guarda `mensaje_enviado` por fila (se reconstruye
  desde la tabla de plantillas al exportar el CSV).
- Índice por `ts` en el log + consultas más livianas → panel más rápido.
- Pool de Postgres afinado (keepAlive + timeouts) y menor frecuencia de polling
  del dashboard.
- Alerta de "sin leads" con anti-falsos-positivos (lock por BM, reintento y
  debounce) para no dispararse durante redeploys.
