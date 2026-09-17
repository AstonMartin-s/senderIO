# CODE_MAP — SenderIO (SND)

> Mapa de arquitectura del orquestador de goteo WARM sobre Kommo.
> Generado como entregable del R1 `MSG-CRM-20260902-SND-MAPEO-SALIDA`.
> Read-only, sin secretos (R7): solo nombres de variable de entorno.

## Idea central (leer antes que nada)

**SenderIO NO envía mensajes.** No toca la API de Meta / 360dialog. Su trabajo es
**mover leads entre etapas de un pipeline de Kommo**; el **SalesBot de Kommo** es
quien dispara la plantilla WABA al detectar el cambio de etapa. Por lo tanto:

- El "envío" = `moveLead(lead, pipeline, stageDestino)` (una llamada REST v4 a Kommo).
- El "ritmo/goteo" = **la cadencia con la que se mueven leads**, no un rate de API de mensajería.
- El "emisor/línea" = un **BM** (Business Manager / número), modelado 1:1 con un pipeline de Kommo.
- No hay delivery/read receipts propios: el único feedback es un webhook de Kommo
  cuando el lead cambia a etapa SI / NO / ERROR.

Esto es la diferencia estructural con la SALIDA del CRM (que envía directo por API,
tiene `EmisorEstado`, receipts y `PERMANENT_FAILURE_CODES`). Casi todo lo
**reutilizable** de SenderIO es el **motor de cadencia/cortafuegos**, no el transporte.

---

## 1. Arquitectura / stack

- **Runtime:** Node ≥20 + TypeScript ejecutado con `tsx` (sin build; `type: module`).
- **DB:** Postgres como fuente de verdad, vía **Drizzle ORM** (`pg` pool).
- **HTTP:** Fastify 5 (API + webhook). `@fastify/formbody` (Kommo manda urlencoded),
  `@fastify/static` (sirve el dashboard build).
- **Cron:** `node-cron` (solo para el reset diario 00:05).
- **Validación:** `zod`.

### Procesos (dos entrypoints separados; en Railway = dos servicios)

| Proceso | Entry | Rol |
|---|---|---|
| `api`    | `src/api/index.ts`    | Fastify: `/webhook/kommo`, `/api/*`, sirve dashboard |
| `worker` | `src/worker/index.ts` | Relojes por BM (goteo) + LISTEN/NOTIFY + cron reset + jobs |

Scripts: `start:api`, `start:worker`, `start:api:prod` (corre `db:migrate` antes).

### Estructura de carpetas

```
src/
  config.ts              # env → config (multi-cliente Kommo: mooney|king)
  db/
    schema.ts            # clients, bm_config, log_movimientos, plantillas, eventos_kommo, kpi_snapshots
    client.ts            # pool + drizzle
    migrate.ts / seed.ts / clean.ts
    notify.ts            # canal LISTEN/NOTIFY de control
  kommo/
    types.ts             # interfaz KommoClient
    real.ts              # cliente REST v4 (fetch)
    mock.ts              # simulador en memoria (KOMMO_MODE=mock)
    index.ts             # factory por cliente (getKommoClient)
    salesbot.ts / salesbot-rotacion.ts  # generación del JSON del SalesBot (import manual)
  lib/
    time.ts              # ventana horaria (TZ, cruza medianoche), intervalo aleatorio + jitter
    phone.ts             # normalización E.164
  services/
    bm.ts                # CRUD BM + alta automática (crea pipeline+5 etapas en Kommo)
    firewall.ts          # ★ cortafuegos: aplica resultado, pausas, pctErrorMovil
    movimientos.ts       # bitácora log_movimientos
    plantillas.ts        # rotación, moderación, import desde Kommo
    kpis.ts              # agregación KPI por BM y por lista/segmento + snapshots
    clients.ts           # tenants
    trazabilidad*.ts     # push asíncrono al programa Trazabilidad
  worker/
    scheduler.ts         # ★ motor de goteo: un setTimeout-loop por BM
    listener.ts          # LISTEN/NOTIFY → reevaluación inmediata
    index.ts             # arranque worker
  jobs/
    reset.ts             # reset diario 00:05 + snapshot
    plantillas.ts        # sweep 60s: reconcilia campo PLANTILLA_ENVIADA
    trazabilidad-sync.ts # recupera envíos no pusheados
  api/routes/            # webhook, bms, control, kpis, plantillas, clients, traza
  traza/feed.ts          # GET /traza/v1/feed (Control; no es el ingest viejo)
dashboard/               # React/Vite (panel de operación)
```

### Librería reutilizable vs acoplado a SenderIO

- **Reutilizable (puro, sin Kommo):** `lib/time.ts` (`dentroDeVentana`, `intervaloAleatorioSeg`,
  `minutosAleatorios`), `lib/phone.ts`, la **política de cortafuegos** de `firewall.ts`
  (racha→pausa dura, aislado→pausa corta, ventana móvil de %error), y el **patrón** del
  scheduler (reloj por emisor, `proximoTickAt` para recuperar estado, locks anti-solape).
- **Acoplado a SenderIO/Kommo:** todo `kommo/**`, `bm.ts` (alta = crear pipeline+etapas),
  `salesbot*.ts` (genera JSON del bot para import manual), el modelo "mover lead entre
  etapas" como forma de enviar, `plantillas.ts` (rotación vía `PLANTILLA_ENVIADA`).

---

## 2. Goteo / drip scheduling — `src/worker/scheduler.ts`, `src/lib/time.ts`

- **Motor:** un `setTimeout` recursivo **por BM** (no cola, no cron). `timers: Map<bmId, Timeout>`.
  Cada BM se autoprograma su próximo tick. `startScheduler()` levanta un reloj por BM activo.
- **Unidad de pacing:** **por BM** (= por línea/número). No hay pacing global cross-BM más
  allá del lock de origen compartido.
- **Intervalo entre envíos:** `intervaloAleatorioSeg(min, max)` =
  `uniforme(min,max) + jitter ±10%`. Defaults `intervaloMinSeg=120`, `intervaloMaxSeg=180`
  (2–3 min). Configurable por BM en caliente.
- **Ventana horaria:** `dentroDeVentana(ventanaInicio, ventanaFin)` en la TZ de operación
  (`config.tz`, default `America/Argentina/Cordoba`). Soporta ventanas que cruzan medianoche.
  Defaults `17:30`–`23:59`. Fuera de ventana → re-chequea en 60s.
- **Tope diario:** `limiteDiario` (default 30). Alcanzado → re-chequea en 300s.
- **Cómo se drena la cola:** en cada tick toma **1 lead** de la etapa de origen
  (`getFirstLeadInStage`), estampa plantilla (rotación), lo mueve a destino, +1 al contador,
  reprograma el próximo tick. Sin leads → marca `sinLeads` tras 2 polls vacíos y sigue.
- **Recuperación tras reinicio:** `proximoTickAt` se persiste cada tick; al arrancar se
  respeta si es futuro, si no arranca con retardo aleatorio 2–20s (evita ráfaga en redeploy).
- **Reactividad panel:** `listener.ts` escucha LISTEN/NOTIFY; un cambio en Por BM
  (pausar/editar/alta/baja) llama `reevaluar(bmId)` en modo `panel`: reaplica
  pausa/ventana/tope/ritmo y **no mueve leads**. El envío solo ocurre en el
  tick de goteo ya programado.
- **Locks in-memory (no cubren 2 procesos):** `enVuelo: Set<leadId>` (origen compartido
  entre BMs), `enProceso: Set<bmId>` (ticks solapados del mismo proceso).
- **Lock de líder (Postgres):** `src/worker/index.ts` toma `pg_try_advisory_lock` al
  arrancar. Un segundo worker contra la misma base espera y no levanta relojes.
  Incidente 2026-09-04: dos servicios Railway (`SenderIO/worker` + leftover
  `Worker-SenderIO/worker`) disparaban el mismo BM a ~1s (a veces el mismo lead dos veces).

---

## 3. Warmup / ramp

**No existe automatización de calentamiento.** No hay curva día-1/día-2, ni estado de
"warming" persistido, ni escalado automático de topes. El calentamiento se hace **a mano**
subiendo/bajando `limiteDiario`, `intervaloMin/MaxSeg` y `ventanaInicio/Fin` por BM desde el
panel. Lo más cercano a "estado por línea" son los campos de `bm_config` (topes, contadores,
pausas), pero el operador los ajusta manualmente.

---

## 4. Líneas / emisores (pool) — `bm_config`, `scheduler.ts`, `firewall.ts`

- **Emisor = BM = pipeline de Kommo.** Cada BM tiene reloj propio e independiente.
- **Asignación destino→línea:** no hay routing dinámico. Cada BM lee su **propia** etapa de
  origen. Se puede compartir una "base general" (un stage físico en otro pipeline) entre
  varios BMs vía `stageOrigenPipelineId`; el lock `enVuelo` evita que dos BMs tomen el mismo lead.
- **Estados de salud (NO hay enum tipo `EmisorEstado`).** Se modela con booleanos/timestamps
  en `bm_config`:
  - `activo` — el reloj corre o no.
  - `pausado` (bool) — **pausa dura** por racha de errores; dura hasta el reset diario o
    reactivación manual.
  - `pausadoHasta` (timestamp) — **pausa corta** por error aislado (5–10 min aleatorios).
  - `sinLeads` (bool) — la etapa origen quedó vacía (no es pausa; alerta en panel).
  - `pctErrorMovil` — % de ERROR sobre los últimos 20 resultados.
- **Detección de baneo/limitación:** llega como webhook de Kommo con la etapa ERROR
  (error 3132 Kommo = 131049 Meta = *frequency capping*). No hay sondeo de salud del número;
  la señal es reactiva vía resultado.
- **Sacar del pool:** no hay "remover línea"; se **pausa** (corta o dura). La despausa dura
  ocurre en el reset diario (solo para BMs `activo=true`) o manualmente.

---

## 5. Rate-limit / throttle / backoff / retries — `firewall.ts`, `scheduler.ts`, `webhook.ts`

- **Límites duros:** no aplica un `msg/s` de mensajería (no envía). El "límite" es
  `intervalo + jitter` (msg/BM cada ~2–3 min) + `limiteDiario` + ventana horaria.
- **Reintentos del worker (lectura de origen):**
  - `buscarLeadEnOrigen`: 1 reintento tras 5s (cubre consistencia eventual / redeploy).
  - Error de API Kommo → reprograma en 30s (no cuenta como "sin leads").
  - Lead ya `enVuelo` → reintenta en 5s.
- **Backoff ante 429 de Kommo:** en `listTemplates` (lectura de detalle de plantillas),
  reintento con backoff lineal `500ms * intento`, hasta 4 intentos, **secuencial** (el modo
  paralelo disparaba 429 que dejaban plantillas sin WABA).
- **Idempotencia / dedupe:** tabla `eventos_kommo`, `eventId = "${clientId}:${leadId}:${statusId}"`
  con `unique`. Webhook duplicado → `{ ok:true, dedupe:true }`.
- **Mapa de códigos de error → acción** (`webhook.ts::clasificar` + `firewall.ts::aplicarResultado`):

  | Señal (etapa Kommo) | Interpretación | Acción |
  |---|---|---|
  | `stageErrorId` (3132/131049) | frequency capping | +1 error consecutivo/hoy; recalcula `pctErrorMovil` |
  | errores consecutivos ≥ `umbralErroresConsecutivos` (default 5) | número saturado | **pausa dura** (`pausado=true`) resto del día |
  | error aislado (< umbral) | ruido normal | **pausa corta** aleatoria 5–10 min (`pausadoHasta`) |
  | `stageSiId` (SI) | interacción positiva | resetea racha (`erroresConsecutivos=0`) |
  | `stageNoId` (NO) | interacción negativa | resetea racha |
  | etapa no mapeada | irrelevante | ignora |

  No hay "marcar destino inválido" ni descarte de número: el lead ya se movió de la base al
  moverlo a envío, así que no se reintenta. La única acción sobre el emisor es pausar.
- **Banda de salud (informe/README, no alertado automático):** sana 5–10%, alerta >15% sostenido.

---

## 6. Estados de envío / delivery — `log_movimientos`

- **No hay máquina pendiente→enviado→entregado→leído→fallido.** No hay receipts ni "leído".
  Los estados son **basados en etapa de Kommo**, registrados en `log_movimientos.accion`:
  - `movido_a_envio` — el lead se movió a la etapa de envío (equivale a "disparado").
  - `resultado_si` / `resultado_no` / `resultado_error` — llegan por webhook.
  - `pausa_bm`, `sin_leads` — eventos de control.
- **Tracking:** cada fila guarda `bmId, leadId, telefono (E.164), segmento, plantilla,
  templateNombre, ts, etapaDestino, resultado`.
- **Anti-reenvío:** (a) al mover el lead **sale físicamente** de la etapa de origen, así que
  no vuelve a ser tomado; (b) `enVuelo` lock intra-proceso; (c) `eventId` unique dedupe de
  webhooks. No hay "ventana de no-repetición" por número más allá de eso.

---

## 7. Audiencia / base

- La **base es la etapa de origen en Kommo** (leads que el CRM/operador dejó ahí). SenderIO
  no gestiona la lista: **dedupe, opt-out, blacklist y validación de número viven en Kommo/CRM
  aguas arriba**, no en SenderIO.
- Único tratamiento propio: normalización a E.164 (`lib/phone.ts`) para la trazabilidad y
  captura de la etiqueta/lista (`segmento`) del lead al enviar.
- No hay ventana de no-repetición configurable: la garantía es "el lead sale de la base al
  moverse" (one-shot por lead mientras esté en la base).

---

## 8. Plantillas / variantes — `plantillas.ts`, `salesbot-rotacion.ts`

- **Modelo:** tabla `plantillas` (1:N por BM). Cada plantilla es una rama del SalesBot.
- **Rotación:** round-robin por BM con `bm_config.rotacionIdx`. En cada tick el worker elige
  `rotacion[rotacionIdx % n]`, **estampa su `valorEstampado` en el campo `PLANTILLA_ENVIADA`**
  del lead *antes* de moverlo, y el SalesBot (nodo Condición) rutea a la rama correcta.
- **Qué entra en rotación (`getRotacion`):** `enBot=true` + `estado=approved` + `valorEstampado`.
  Se usa `enBot` (no `activo`) a propósito: el worker solo puede rotar lo que el bot importado
  en Kommo sabe rutear. Cambiar `activo` no afecta el envío hasta **regenerar e importar** el bot.
- **Sin spintax/variables:** las plantillas WABA son texto fijo aprobado por Meta; no hay
  personalización por contacto ni spintax. La "variante" es elegir otra plantilla completa.
- **Aprobación:** `estado ∈ {local, review, approved, rejected, paused, borrador}`, sincronizado
  con la moderación de Kommo/Meta. Ver §9 para las incidencias.

---

## 9. Kommo específico — `kommo/real.ts`, `salesbot*.ts`

- **Transporte:** REST v4 (`https://<subdomain>.kommo.com/api/v4`, Bearer token de integración
  privada). Operaciones: `GET /leads` (por pipeline+status), `PATCH /leads/:id` (mover / setear
  campo), `GET /leads/:id?with=contacts` (teléfono+etiqueta), `/leads/pipelines`,
  `/chats/templates`, `/chats/templates/:id/review`.
- **El envío real lo hace el SalesBot de Kommo**, no SenderIO. SenderIO solo mueve el lead y
  estampa `PLANTILLA_ENVIADA`.
- **Incidencias conocidas de Kommo:**
  - **El SalesBot no tiene API pública:** se genera el JSON (`salesbot-rotacion.ts`) y el
    operador lo **importa a mano** en Kommo (`botListo` lo confirma). Cambiar la rotación exige
    regenerar+reimportar.
  - **Crear plantilla WABA por API no asigna el WABA:** Kommo ignora `waba_selected_waba_ids`,
    la deja en Borrador y **nunca llega a Meta**. Camino soportado: crearla en la UI de Kommo y
    después "Importar de Kommo".
  - **429 intermitente** al leer detalle de plantillas en paralelo → lectura secuencial + backoff.
  - **`review_status` a veces `unknown`** por API (según plan): no se degrada una plantilla ya
    aprobada.
- **Diferencia con envío directo (360dialog/Meta):** SenderIO **no** ve delivery/read, ni
  usa `PERMANENT_FAILURE_CODES`; el único fallo observable es `frequency capping` (3132)
  devuelto como cambio de etapa. Un envío directo tendría receipts finos y códigos de error
  ricos que acá no existen.

---

## 10. Observabilidad / aprendizajes — `kpis.ts`, `reset.ts`, `trazabilidad-push.ts`

- **Métricas:** por BM y por **lista/segmento** (etiqueta Kommo): `enviados, si, no, errores,
  pctError, pctSi`. `pctErrorMovil` en vivo (ventana de 20 resultados). KPIs de hoy + históricos.
- **Snapshots:** `kpi_snapshots` archiva la foto del día en el reset 00:05 (por BM + TOTAL).
- **Alertas:** `sinLeads` (origen vacío) marcado en panel. Bandas de %error (sana 5–10%,
  alerta >15%) documentadas pero **no** hay alerting automático (Slack/email); se ve en panel.
- **Trazabilidad externa (dual-run):** push asíncrono al programa Trazabilidad
  (`/api/v1/spam/envios` y `/api/v1/spam/plantillas`) **sigue ON**. Control tira de
  `GET /traza/v1/feed` (docs/traza-feed.md). No retargetear `TRAZABILIDAD_API_URL`.
- **Top de lecciones que bajaron errores/bans en prod:**
  1. `frequency capping` (3132) es la señal principal de saturación → pausar rápido.
  2. Racha de 5 errores consecutivos = número quemado → **pausa dura** hasta el reset.
  3. Error aislado → **pausa corta aleatoria** (no determinística) en vez de seguir a full.
  4. Intervalo con **jitter ±10%** + ventana horaria + tope diario evitan patrones robóticos.
  5. Mover **de a un lead** por tick (no lotes) mantiene el ritmo humano.
  6. Lecturas **secuenciales** a Kommo (no paralelas) para no comerse 429.
  7. Un SI/NO resetea la racha (interacción legítima = el número está sano).

---

## Variables de entorno (nombres, sin valores — R7)

`DATABASE_URL`, `KOMMO_MODE` (real|mock), `KOMMO_SUBDOMAIN`, `KOMMO_TOKEN`,
`KOMMO_WEBHOOK_SECRET`, `KOMMO_CF_PLANTILLA_ID`, y equivalentes `KOMMO_KING_*` para el
segundo tenant. `PORT`/`API_PORT`, `ADMIN_PASSWORD`, `TZ`, `TRAZABILIDAD_API_URL`,
`TRAZABILIDAD_INGEST_API_KEY`, `TRAZABILIDAD_PUSH_ENABLED` (dual-run: queda ON
hasta que Control cruce), `TRAZA_FEED_TOKEN` (bearer del feed; lo carga CRED).
