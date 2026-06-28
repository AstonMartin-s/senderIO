# BMs / números conectados en Kommo (referencia)

> Cuenta: **mooneyatkinson.kommo.com** · actualizado 2026-06-28
> Generar de nuevo con: `npx tsx scripts/captar-bms.ts`

## Qué se puede captar por API (token v4) y qué no

| Dato | ¿Por API v4? | Cómo se obtiene |
|------|--------------|-----------------|
| pipeline_id + etapas | ✅ | `scripts/captar-bms.ts` |
| template_id + botones | ✅ | `scripts/captar-bms.ts` |
| estado de aprobación de plantilla | ⚠️ por plantilla | botón "Chequear estado" (endpoint review) |
| **WABA id** (cuenta de WhatsApp Business) | ❌ | manual: panel de integraciones → número → "Cuenta de WhatsApp Business · ID" |
| **chat_source id** (canal del bot) | ❌ por API | manual: editor del Salesbot → bloque "Iniciar Salesbot" → selector de canales; cada canal trae su id en `data-value` (DevTools). Ej.: "Manufactura Ram" = `58924` |

## Pipelines de los números (alta de BM)

| BM | Pipeline | pipeline_id | Origen (Base de datos) | Envío (destino) | Si | No | Error |
|----|----------|-------------|------------------------|-----------------|----|----|-------|
| **BM1 · DogzeePL** | SPAM NUMERO #1 | `13334059` | `102835887` | `102835891` | `102835895` | `105635847` | `102836183` |
| **BM2 · Fisioforma** | SPAM NUMERO #2 | `13757935` | `106149911` | `106149915` | `106149919` | `106149975` | `106149979` |
| **BM3 · LosArmandoCereales** | Spam Numero 3 | `13790083` | `106401855` | `106401859` | `106401863` | `106401915` | `106401919` |
| BM4 | Spam Numero 4 | `13837663` | `106773751` | `106773755` | `106773759` | `106773763` | `106773767` |
| **BM5 · Ambienger** | Spam Numero 5 | `13837691` | `106773895` | `106773899` | `106773903` | `106773907` | `106773911` |
| (test) | ZZ_TEST_BM | `14018839` | `108203983` | `108203987` | `108203991` | `108203995` | `108203999` |

> BM1 tiene 2 etapas de ejecución (PlanTilla 1 `102835891`, PlanTilla 2 `105698987`) y "Solicita BAJA" `105635851`.

## WABA id por cuenta (leído del panel de integraciones)

| Cuenta de WhatsApp Business | WABA id | Estado | BM |
|-----------------------------|---------|--------|----|
| Dogzee PL (Dogze PL BM1) | `1456910238976470` | Aprobado | **BM1** |
| fisioforma (Francesadas) | `1019386220453924` | Aprobado | **BM2** |
| Los Armando Cereales SRL | `964803575976136` | Aprobado | **BM3** |
| AMBIENGER ENGENHARIA AMBIENTAL LTDA (nanda_s_collections) | `1313154394221905` | Aprobado | **BM5** |
| Jugador Activo 888 (2) — Ganadera agro / Agro Mooney / Agro Norte / Ganadera norte a sur | `722907647191195` | Aprobado | (sin asignar) |

## chat_source id por canal (leído del editor del bot)

| Canal | chat_source id | BM |
|-------|----------------|----|
| Fisioforma Bebedouro LTDA | `59692` | **BM2** |
| (Spam Numero 3 / BM3) | `59026` | **BM3** |
| Manufactura Ram (viejo SP2) | `58924` | — |
| _resto: leer del editor (DevTools → `data-value`)_ | — | — |

## Plantillas WABA disponibles

| Plantilla | template_id | Botones |
|-----------|-------------|---------|
| Welcomeback1 | `52014` | Solicitar Baja / No / Si |
| Welcomeback2 | `52040` | No me interesa / Recibir ahora |
| SP4 | `52266` | No me interesa / Aprovechar ahora |
| SP2 | `52380` | No me interesa / Reclamar ahora |
| SPnumero3 | `52524` | Aprovechar Ahora / No gracias |
| SPnumero3A | `52528` | Recibir Ahora / No, gracias |
| SPnumero1 | `53022` | No gracias / Aprovechar ahora |
| SPnumero2 | `53024` | No gracias / Aprovechar Ahora |
| SPnumero4 | `53126` | Aprovechar Ahora / No gracias |
| Spnumero4a | `53128` | Ver Ahora / No gracias |
| Spnumero4b | `53154` | Si / No gracias |
| Spnumero3C | `53712` | Si quiero / No gracias |
| SPnumero1A | `53714` | Recibir ahora / No gracias |
| SPnumero2A | `53762` | Me interesa / No gracias |
| SPnumero2AA | `53770` | Si quiero / No gracias |
| Spnumero3AA | `54228` | Si quiero / No gracias |

## Modelo de asociación (DB)

- `bm_config.wabaId` → WABA id del número (manual, una vez).
- `bm_config.chatSourceId` → canal del bot (manual, una vez).
- `plantillas.bmId` → la plantilla se asocia al BM que la creó (asociación manual al crearla en SenderIO).
- `plantillas.wabaId` → se autocompleta con el WABA id del BM elegido.
- Sincronización con Kommo: "Chequear estado" (aprobación) e `importarDesdeKommo` (alinear lo ya creado).
