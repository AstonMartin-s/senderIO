# PLAN DE ACCIÓN — SenderIO (SND)

## 2026-10-20 — BM5 quieto con base

- BASE DE DATOS de Fisioforma tiene 113 fichas. El BM está activo y en
  ventana. El reloj se cortó el 19 a las 20:40: un tick tiró `fetch failed`
  y no se reprogramó. El resto de los BM siguió. El tick ahora se rearma
  a los 60s si falla.

Registro vivo de avances y contratos (R3/R4). Instancia: Aston · tag SND.

## 2026-10-19 — Cruce de errores para el wa-checker

- `POST /api/errores/cruce` devuelve los teléfonos de una lista que ya
  tuvieron error. El tick está en el paso Verificar del wa-checker y los
  saca antes de consultar WhatsApp. Contrato en CONTRACT_MAP.
- ACK WAC MSG-WAC-20261019-1: tick publicado en wa-checker `603aeb7`.
  El token quedó en senderIO y en wa-checker. El código de SenderIO
  todavía no estaba en main; se publica con este cambio.

## 2026-10-19 — BM1: pack de ClienteS1 cerrado a 500

- La base siguió vacía. Los 3 que faltaban se movieron a mano a Ejecución
  Plantilla 1 (SPAM NUMERO #1). Leads 28263742, 28263740 y 28263708, etiqueta
  ClienteS1, sin fila previa de envío.
- Se anotaron en el log como movido_a_envio (teléfono y segmento). No se
  volvió a mover nada en Kommo. Paquete: 500 enviados sin error, 79 errores,
  0 restantes. BM1: enviados hoy = 3.
- Los 2.276 errores del log están todos sellados `error_3132`. El bot manda
  cualquier fallo de envío a la columna ERROR y SenderIO no guarda el código
  de Meta. En la ficha de Kommo no queda nota ni evento con el motivo.
- El código fino (5132, 5133, 5126) está en el chat. `GET /talks/{id}/messages`
  responde 403: a la integración le falta el permiso External chat history.
  Ese método, en la doc, solo dice si falló, no el número del globo.
- Script: `scripts/errores-chat.ts`. Token nuevo en la bóveda
  (`kommo-chat.token` y `KOMMO_TOKEN` del .env local). No se cambió Railway.
  El chat responde, pero el mensaje solo trae `delivery_status: error`.
  El 5132 / 5133 / 5126 del globo no viene en la API.
- Limpieza de cupo: el log guarda el error con teléfono en 2274 de 2276.
  Borrar el lead en Kommo no borra eso. Para liberar cupo sin perder el chat,
  mover ERROR y NO a Cerrado-perdido (No finalizado). Envío y SI se dejan.

## 2026-10-16 — Alta ClienteS2

- Cliente `clienteS2`, nombre ClienteS2, etiqueta Kommo `clientes2`.
- Paquete con tope 500. Hoy: 0 enviados, 0 errores, 500 restantes.
- No pisa `clientes1`. La oferta quedó vacía. El link `/cliente` sigue en ClienteS1.
- `/assets/` no pide la clave de administración: si no, el navegador
  muestra usuario y contraseña antes del token.
- Panel propio: `https://senderio-production.up.railway.app/cliente/clienteS2`.
  Misma pantalla que S1. Se copió oferta, mensaje, plantilla y redirecciones.
  La base y la lista de S1 no. El token está en
  `boveda/senderio/real/cliente-panel-s2.env`.

## 2026-10-16 — Métricas: una sola cuenta

- Cada pantalla del log (funnel, overview, log, clientes, paquete y panel
  del cliente) cuenta envíos, no eventos sueltos. El resultado es el último
  SI, NO o ERROR del lead y se anota en el último envío.
- Cierra siempre: enviados = sin error + errores, y sin error = SI + NO +
  los que siguen en envío. Un disparo duplicado en menos de un minuto cuenta
  una vez. Un resultado sin envío no suma.
- El % que pausa un BM sigue siendo el de los últimos 20 resultados. No es
  el % de cobro.
- El embed muestra el encabezado SenderIO / Orquestador de goteo.

## 2026-10-16 — Panel embebido para Tracker

- `/embed/{overview,bms,plantillas,funnel,log,clientes,verificador}` abre la
  vista sin la sidebar de Sender. El selector de Kommo queda en la página.
- `frame-ancestors` solo para `https://panel.trackerapp.site` y
  `https://tobyap-production.up.railway.app`.
- Sin Basic en la URL. La página se entrega si el Referer es Tracker (o un
  refresh del propio embed) y deja cookie para el API. El panel directo sigue
  con Basic.
- Ref: MSG-TOB-20261016-SND-1. TOB desplegó la sidebar (d05366a,
  Railway 1fd8d27b SUCCESS). Confirmado en
  tobyap-production.up.railway.app/admin/senderio/funnel: sin sidebar de
  Sender, selector Kommo en CRM, datos del funnel adentro.
- Cierre: MSG-TOB-20261016-SND-2. Sidebar de Tracker sin cambios. Encabezado
  del embed lo resolvió SND. Costura cerrada.

## 2026-10-13 — % error sobre enviados con éxito

- Antes: ERROR / (SÍ + NO + ERROR). En ClienteS1 eso era 69/135 ≈ 51%.
- Ahora: ERROR / enviados con éxito. Éxito = enviados − errores (incluye SÍ,
  NO y los que siguen en envío). ClienteS1: 69/426 = 16,2%.
- Misma fórmula en métricas por etiqueta, funnel y la lectura en vivo de Kommo.
  El % móvil del cortafuegos del BM no cambia.

## 2026-10-01 — ClienteS1: el 145 de Kommo estaba cortado; el cobro es 165

- Cobro = enviados sin error = los que salieron y no están en ERROR.
  SI y NO entran en ese número. No se restan.
- Log y tablero completo coinciden: 203 salieron, 38 error, 165 a cobrar
  (133 todavía en envío + 20 SI + 12 NO).
- La tarjeta «Estado en Kommo» mostraba 145/2/5/5 porque dejaba de leer
  a las 500 fichas. BM1 SI/NO/ERROR superan eso. Ahora lee la etapa entera.
- El texto del paquete dice explícito que los enviados con error no se cobran.

## 2026-09-26 — Traza ClienteS1 alineada al tablero

- Recorrido completo de las etapas de BM1/BM3/BM5/BM6 (el tope de 500
  ocultaba SI/NO de BM1). Etiqueta ClienteS1: 267 en base, 40 en envío,
  5 SI, 8 NO, 8 ERROR.
- Se anotaron 7 envíos manuales de BM1 que no estaban en el log, con
  teléfono. Se sacaron 5 envíos+error de BM6 que el usuario devolvió a
  la base. Dos resultados (1 SI, 1 NO) copiaron etiqueta y teléfono del
  envío. El log queda 61 / 5 / 8 / 8. Sin error = 53.

## 2026-09-25 — BM6 borrado: el historial no se fue

- `DELETE /api/bms/:id` solo borra la fila de `bm_config`. `log_movimientos`
  no tiene FK, así que los 97 movimientos de BM6 siguieron en la base.
- Se reinsertó BM6 (Ambienger, pipeline 14508603) apagado y en pausa dura,
  que es como estaba: 5 errores seguidos, 5/45 hoy. El ritmo 520–860 s y la
  ventana 14:00–23:59 salen de los huecos del log, no del formulario original.
  WABA id no está en el log.

## 2026-09-25 — Traza por número: enviados y enviados sin error

- La tabla de Clientes cortaba en 200 filas en el orden de la lista. Los 41
  envíos de ClienteS1 estaban en las posiciones 229–316, así que se veía todo
  Pendiente.
- SI/NO/ERROR del webhook no traen teléfono. La traza los hereda del envío del
  mismo lead. A partir de ahora el webhook también copia el teléfono del envío.
- Columna «Sin error» = envíos − errores. Esos números descuentan el paquete.
  Quedan arriba de la tabla. ClienteS1: 41 enviados, 36 sin error, 2 SI, 5 NO,
  5 errores.

## 2026-09-23 — Reconciliar métricas de cliente contra Kommo (en vivo)

- Los movimientos MANUALES en Kommo no pasan por worker/webhook, así que no
  entran al `log_movimientos` ni a las métricas del funnel/etiqueta.
- Nuevo `/api/clientes-etiqueta/:id/kommo` (solo lectura): recorre las etapas de
  cada BM, lee la primera tag de cada lead y las reparte por cliente-etiqueta.
  `enviados = ENVIO ∪ SI ∪ NO ∪ ERROR`; SI/NO/ERROR = leads en esa etapa.
- UI: bloque "Estado en Kommo (en vivo)" en la sección Clientes (botón por
  cliente). No altera el log ni el goteo. Kommo `listStageLeadsWithTag`.
- Requiere que el pipeline testeado (ej. Ambienger) esté dado de alta como BM
  en `bm_config` (si no, no se cuenta).

## 2026-09-23 — Cliente por etiqueta + CRM (catch-all)

- Nuevo agrupado de métricas por **etiqueta de Kommo** (`log_movimientos.segmento`
  = primera tag del lead). Cada cliente reclama prefijos (`clients.etiquetas`),
  match case-insensitive por prefijo (Piliking agrupa "Piliking 2", etc.).
- `mooney` pasa a mostrarse como **CRM** y es el **catch-all**: se queda con todo
  lo que no reclame otro cliente. Piliking → `["piliking"]`, ClienteS1 →
  `["clientes1"]`. Migración `0018`.
- Funnel & KPIs: selector **Cliente** (por etiqueta). Sin seleccionar = todos.
  Filtra embudo, por-BM y por-lista (con herencia SI/NO/ERROR por lead).
- Sección Clientes: tabla **Métricas por etiqueta** (enviados/SI/NO/ERROR/%) por
  cliente, día en curso. Endpoints `/api/clientes-etiqueta` y `…/resumen`.
- Selector de tenant global (`/api/clients`) excluye los clientes-etiqueta.
- **Fix seguridad**: la exención de Basic Auth `/api/cliente` matcheaba
  `/api/clientes-etiqueta` (quedaba público). Ahora exige `/api/cliente/`.
- El envío NO cambia: esto es solo agrupado/atribución de métricas.
- typecheck + build OK. Deploy prod SUCCESS (`de4e520` + fix `512f2d04`/auth).

## 2026-09-22 — Cliente aislado: atribución por BM

- Modelo corregido: el consumo/traza de un cliente de paquete NO se cruza con
  la operación general. Sale SOLO de los envíos de los BM atribuidos a ese
  cliente (`bm_config.paquete_cliente_id`). Migración `0017`.
- Sin BM asignado → todo pendiente (enviados = 0). El "10" anterior era ruido
  del log compartido de Mooney; ya no cuenta.
- Traza `trazaPorNumero`: intersección lista filtrada ∩ envíos de BM del cliente.
- UI: sección "Cliente (operación de paquete)" en el modal de BM (selector de
  cliente). ClienteS1 usará p.ej. BM1 asignado.
- No cambia la lógica de envío; solo atribución. typecheck + build OK.

## 2026-09-21 — Fix normalización teléfono AR (consumo del paquete)

- Causa del "10 enviados": números de la lista cargados sin país (ej.
  "11 6467-5373") quedaban `+1164675373` (país 1) y no cruzaban con la
  operación (`+549…`) en `log_movimientos`. El cruce sale SOLO de esta DB
  (envíos propios); no se mezcla con otras bases.
- Fix en `normalizePhoneE164`: sin `+` y sin empezar con 54, 10–11 dígitos →
  `+549`. Smoke 7/8 (el "FAIL" es el caso `00…`, comportamiento preexistente).
- Aplica de acá en adelante: hay que **recargar la lista filtrada** de clienteS1
  para renormalizar lo ya guardado. No se muta la base automáticamente.
- Se quitó el endpoint `/diag` (no exponer cruce con datos internos).

## 2026-09-21 — Admin: pestaña Clientes

- Tab **Clientes** en el panel de operación (Basic Auth). Lista paquetes
  (hoy `clienteS1`; Mooney/King no entran).
- Misma pantalla del cliente: paquete, gestión que cargó (oferta, texto,
  plantilla, redirecciones, notas), traza por número **sin BM**.
- Bajar CSV (base cruda, lista filtrada, traza) y subir CSV/pegar.
- API `/api/admin/clientes/*` (no usa el token del cliente).

## 2026-09-21 — ACK CRED: acceso panel-cliente entregado

- REF: `MSG-CRED-20260921-SND-ACCESO-2` / `MSG-SND-20260921-CRED-ACCESO-ACK-1`.
- Path prod: `https://senderio-production.up.railway.app/cliente` · id `clienteS1`.
- Login = token de bóveda `boveda/senderio/real/cliente-panel.env`
  (`CLIENTE_PANEL_TOKEN`). No es `ADMIN_*` ni `SENDERIO_TOKEN` del feed.
- SND no lee ni pega el valor (R7).

## 2026-09-21 — Panel-cliente: cupo del paquete (500)

- Campo `paquete_total` en `cliente_panel` (default 500, editable). Migración
  `0016_paquete_total.sql`.
- `consumoPaquete`: consumidos = enviado + respondió SÍ + respondió NO sobre la
  lista filtrada del cliente (cruce por teléfono). Los ERROR **no descuentan**.
  Informativo: NO frena el goteo (envío lo maneja el worker por BM).
- `/api/cliente/panel` devuelve `paquete { total, consumidos, restantes,
  errores, pct, activado }`. PATCH acepta `paqueteTotal`.
- Front: banner "Paquete activado · N mensajes" + barra de consumo en Resumen;
  campo editable en Oferta. typecheck + build OK.

## 2026-09-21 — ACK CRED: admin panel cargado + rotado

- REF: `MSG-CRED-20260921-SND-ADMIN-1` / `MSG-SND-20260921-CRED-ADMIN-ACK-1`.
- `ADMIN_USER`/`ADMIN_PASSWORD` en senderIO (production). Redeploy `175debdb` SUCCESS.
- Verificado SND (sin leer valor): pass viejo `changeme` → 401; sin auth → 401;
  `/health` → 200. Credencial válida solo desde bóveda CRED
  (`boveda/senderio/real/admin-panel.env`).
- Worker no tocado. `CLIENTE_PANEL_TOKEN`/`TRAZA_FEED_TOKEN` intactos.

## 2026-09-21 — Admin login panel principal (HTTP Basic)

- Panel de operación ya no se sirve sin auth: hook `onRequest` global con
  HTTP Basic (`ADMIN_USER`/`ADMIN_PASSWORD`, default local `admin`/`admin321`).
- Exentos (tienen credencial propia): `/health`, `/webhook/*`, `/traza/*`,
  `/api/cliente/*` y `/cliente*` (panel-cliente, login por token).
- Comparación con `timingSafeEqual`. CRED carga los reales en prod (R7).
- Smoke: sin/mal auth → 401; `admin:admin321` → pasa (404 en ruta inexistente);
  exentos responden su propia lógica (503 feed/panel disabled).

## 2026-09-21 — Panel-cliente (paquete USD 250)

- Cliente nuevo `clienteS1` en `clients` (oculto del selector de operación).
- Superficie nueva, **read-only respecto al envío**: no toca `bm_config`,
  `scheduler`, `plantillas` ni referencia ningún BM. Solo recipientes.
- DB (`0015_cliente_panel.sql`): `cliente_panel` (oferta, mensaje+plantilla,
  redirecciones, notas, acceso_token), `cliente_base_cruda`, `cliente_lista_filtrada`.
- API `/api/cliente/*` (Bearer `CLIENTE_PANEL_TOKEN`; sin token → 503, malo → 401):
  panel (config+conteos+resumen), base-cruda, lista-filtrada (CSV/pegar),
  traza + traza.csv. Traza cruza `log_movimientos` por teléfono E.164 y
  **oculta bmId**.
- Front: `/cliente` monta `ClienteApp` (app aparte, sin vistas de BM). Tabs:
  Resumen, Trazabilidad (por número), Bases (upload CSV), Oferta/Mensaje.
- CRED: cargar `CLIENTE_PANEL_TOKEN` en senderIO (bearer del panel). Sin pegar valor.
- typecheck backend + build dashboard OK. Smoke parser CSV + E.164 OK.

## 2026-09-17 — ACK CRED: TRAZA_FEED_TOKEN en senderIO

- REF: `MSG-CRED-20260917-FEED-1` / `MSG-SND-20260917-CRED-ACK-1`.
- Token en Railway SenderIO / production / `senderIO`. Worker no tocado.
  `TRAZABILIDAD_*` intactos. Redeploy `888d5882` SUCCESS (`a1d16df`).
- Verificado SND (sin leer el valor): sin Bearer y Bearer malo → `401 unauthorized`.
  Ya no `503 feed_disabled`.
- Dual-run ON. No apagar push. Siguiente: CONTROL copia `SENDERIO_TOKEN`
  desde bóveda CRED y drena (cruzar 9558 únicos).

## 2026-09-17 — R1 CRED: cargar TRAZA_FEED_TOKEN

- REF: `MSG-SND-20260917-CRED-TOKEN-1`.
- Pedido a CRED: generar `TRAZA_FEED_TOKEN` y cargarlo en Railway
  proyecto SenderIO / servicio `senderIO` (production) + el mismo valor
  en Control (scope `traza:feed`). Sin pegar el token.
- Path: `https://senderio-production.up.railway.app/traza/v1/feed`.
- Deploy `a1d16df` SUCCESS (API `26bb7714` + worker `2a3cf0ab`).
  Feed hoy `503 feed_disabled` (var ausente; correcto).
- Dual-run ON. No apagar `TRAZABILIDAD_PUSH_ENABLED`.
- Leftover Worker-SenderIO sigue no-op.

## 2026-09-17 — ACK cierre dump n8n (TRZ)

- REF: `MSG-TRZ-20260917-SND-ACK-1`. Dump cerrado. 9558 = 4757+4895−94.
- Cruce vs Railway viejo: 9556 crm (+2 live post-dump). Plantillas OK.
- Dual-run ON. No apagar push. Siguiente: CRED `TRAZA_FEED_TOKEN` → Control drena.

## 2026-09-17 — Merge dump n8n al feed

- REF: `MSG-TRZ-20260917-SND-DUMP-1` / `MSG-TRZ-20260917-DUMP-SND`.
- JSON no commiteado. Merge idempotente a `log_movimientos` + LEFT JOIN en el feed
  (BM2/BM4 ya no están en `bm_config`).
- Únicos post-merge: **9558** envíos. Plantillas: 0 altas (13 nombres ya existían).
- `resultado_respuesta` para 1ª respuesta n8n (sin inventar SI/NO).
- Dual-run push viejo sigue ON.

## 2026-09-17 — R1 feed Traza v1 para Control

- REF: `MSG-TRZ-20260917-SND-1`.
- `GET /traza/v1/feed` en la API (path prod:
  `https://senderio-production.up.railway.app/traza/v1/feed`).
- Types: `senderio.envio` (4895 únicos locales desde 2026-06-26) +
  `senderio.plantilla` (13). Cursor sin solape.
- Dual-run: push a programa-trazabilidad **sigue ON**. No apagar.
- Falta tramo n8n 2026-05-16 → 2026-06-26 (no está en esta DB) → pedir dump a TRZ.
- CRED: cargar `TRAZA_FEED_TOKEN` en SenderIO y el mismo valor en Control.

## 2026-09-11 — PATCH de Por BM no debe enviar

- Causa: `reevaluar` programaba `tick` a 1s; el tick movía un lead.
- Fix: modo `panel` en `scheduler.ts` — reaplica reloj (pausa/ventana/tope/ritmo)
  y no llama a `moveLead`. Deploy worker `7ee6479` (2026-09-11 16:30 ART).
  Leftover sigue no-op (`DESHABILITADO leftover`).

## 2026-09-04 — Doble worker disparando de a dos

- Causa: dos servicios `worker` vivos contra la misma Postgres/Kommo.
  - SenderIO / worker (se deja)
  - Worker-SenderIO / worker (leftover junio; se deshabilita startCommand)
- Evidencia 10 días: 35 pares mismo lead ≤2s + 4 pares leads distintos ≤2s
  (ej. BM5 15:02:48 lead 24393142 vs 15:02:49 lead 24393148, un log por worker).
- Lock `enProceso`/`enVuelo` es in-memory → no cubre dos procesos.
- Código: advisory lock de líder en `src/worker/index.ts` (pendiente deploy).
- Railway: leftover apagado 2026-09-04 21:48 ART. StartCommand no-op aplicado
  (deploy 60eb0c07). Post-corte: envíos de a uno (26524772, 26524776).
  Lock de líder en código sigue local (no está en el worker de SenderIO).

## 2026-09-02 — R1 mapeo de salida para CRM

- REF: `MSG-CRM-20260902-SND-MAPEO-SALIDA` (pedido de CRM/Aston).
- Acción: mapeo read-only de SenderIO por 10 ejes. Entregable
  `docs/architecture/CODE_MAP.md` + respuesta R1 (etiquetas REUTILIZABLE/ADAPTAR/NO APLICA).
- Sin cambio de contrato. Sin secretos (R7). Si sale costura reutilizable
  (scheduler/rate-limiter compartible) → CONTRACT_MAP + R1 dedicado antes de tocar código.
