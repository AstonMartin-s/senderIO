# PLAN DE ACCIÓN — SenderIO (SND)

Registro vivo de avances y contratos (R3/R4). Instancia: Aston · tag SND.

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
