# SenderIO — Orquestador de goteo WhatsApp (Kommo)

Orquestador propio que reemplaza a n8n. **No envía mensajes**: mueve leads de
una etapa a otra dentro de Kommo y el SalesBot dispara la plantilla. Su trabajo
es orquestar **ritmo, rotación y control** por BM (business manager / número).

Basado en `ESPEC_SISTEMA_GOTEO_WHATSAPP_v2.md`.

## Stack

- **Node.js + TypeScript** (ejecutado con `tsx`)
- **Postgres** como fuente de verdad (Drizzle ORM)
- **Fastify** para la API + webhook
- Dos procesos: `worker` (relojes por BM) y `api` (HTTP + webhook)

## Estructura

```
src/
  config.ts            # carga de variables de entorno
  db/
    schema.ts          # tablas: bm_config, log_movimientos, eventos_kommo, kpi_snapshots
    client.ts          # pool + drizzle
    migrate.ts         # aplica migraciones
    seed.ts            # carga BM1–BM5 de la planilla real
  kommo/
    types.ts           # interfaz KommoClient
    real.ts            # cliente contra la API de Kommo
    mock.ts            # simulador en memoria (para desarrollo local)
    index.ts           # factory según KOMMO_MODE
  lib/time.ts          # ventana horaria, intervalo aleatorio, TZ
  services/            # bm, movimientos, firewall (cortafuegos), kpis
  jobs/reset.ts        # reset diario 00:05 + archivado
  worker/              # scheduler (un reloj por BM) + entrypoint
  api/                 # Fastify + rutas (webhook, bms, control, kpis)
```

## Puesta en marcha (local)

### 1. Postgres

Con Homebrew:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb senderio
```

### 2. Variables de entorno

```bash
cp .env.example .env
```

Editá `.env`:
- `DATABASE_URL` → `postgresql://localhost:5432/senderio` (Homebrew usa tu usuario de macOS).
- `KOMMO_MODE` → `mock` para probar la lógica sin tocar la cuenta; `real` para pegar contra Kommo.
- `KOMMO_SUBDOMAIN` + `KOMMO_TOKEN` → para modo real (token long-lived de integración privada).

### 3. Migraciones + seed

```bash
npm run db:generate   # genera el SQL de migración desde el schema
npm run db:migrate    # crea las tablas
npm run db:seed       # carga BM1–BM5
```

### 4. Arrancar

En dos terminales:

```bash
npm run dev:api       # API + webhook en http://localhost:3000
npm run dev:worker    # relojes por BM (goteo)
```

> En modo `mock`, el worker tiene leads simulados en las etapas origen, así que
> vas a ver el goteo moviendo leads sin tocar Kommo.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/health` | estado |
| POST | `/webhook/kommo` | resultados de Kommo (SI/NO/ERROR) |
| GET  | `/api/bms` | lista BMs |
| POST | `/api/bms` | alta de BM |
| PATCH| `/api/bms/:id` | edición en caliente |
| DELETE | `/api/bms/:id` | baja |
| POST | `/api/bms/:id/pause` `/resume` `/reset-contadores` | control |
| POST | `/api/reset-diario` | reset manual (con archivado) |
| GET  | `/api/kpis?bm=&desde=&hasta=` | KPIs históricos |
| GET  | `/api/kpis/hoy` | KPIs del día en curso |
| GET  | `/api/movimientos?bm=&limit=` | log en vivo |
| GET  | `/api/kommo/pipelines` | pipelines/etapas (alta de BMs) |

## Probar el cortafuegos en local

Simular un resultado ERROR de BM3 (etapa error 106401919, pipeline 13790083):

```bash
curl -X POST http://localhost:3000/webhook/kommo \
  -H "Content-Type: application/json" \
  -d '{"lead_id": 1, "status_id": 106401919, "pipeline_id": 13790083}'
```

Simular un SI (resetea la racha de errores):

```bash
curl -X POST http://localhost:3000/webhook/kommo \
  -H "Content-Type: application/json" \
  -d '{"lead_id": 1, "status_id": 106401863, "pipeline_id": 13790083}'
```

5 ERRORES consecutivos → pausa dura del BM (resto del día). 1 error aislado →
pausa corta (5–10 min).

## Reglas de control (del informe)

- Error 3132 (Kommo) = 131049 (Meta) = **frequency capping** por destinatario.
- Banda sana: 5–10%. Alerta: >15% sostenido.
- **Pausa corta** por error aislado; **pausa dura** por 5 errores consecutivos.
- Un SI/NO resetea la racha de errores consecutivos.

## Pendiente / próximos pasos

- Dashboard web (React/Vite).
- Espejo asíncrono a Google Sheets.
- Deploy en Railway (Postgres + servicio `api` + servicio `worker`).
- Completar `stage_si`/`stage_no` de BM1, BM2, BM4, BM5 mirando cada pipeline.
