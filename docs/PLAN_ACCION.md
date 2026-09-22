# PLAN DE ACCIÓN — SenderIO (SND)

Registro vivo de avances y contratos (R3/R4). Instancia: Aston · tag SND.

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
