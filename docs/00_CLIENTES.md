# Clientes (Mooney · King)

> 2026-08-17 · SenderIO multi-tenant
>
> **Estado King (2026-08-17):** diferido. Se opera solo el perfil Mooney
> hasta que haga falta encender King. El código del selector/tenant queda
> en el repo; no cargar `KOMMO_KING_*` ni migrar/alta hasta entonces.

El panel opera **varios clientes en el mismo proceso**. Cada cliente tiene su
cuenta Kommo, sus BMs y su webhook. Las credenciales **no** se guardan en DB
(R7): viven en env.

| Cliente | Env Kommo | IDs de BM | Webhook |
|---------|-----------|-----------|---------|
| **mooney** (histórico) | `KOMMO_SUBDOMAIN` / `KOMMO_TOKEN` | `BM1`, `BM2`… | `POST /webhook/kommo` (compat) |
| **king** | `KOMMO_KING_SUBDOMAIN` / `KOMMO_KING_TOKEN` | `KING-BM1`… | `POST /webhook/kommo/king` |
| **damico** | `KOMMO_DAMICO_SUBDOMAIN` / `KOMMO_DAMICO_TOKEN` | `DAMICO-BM1`… | `POST /webhook/kommo/damico` |

Damico es una cuenta Kommo aparte (venta de autos). No comparte pipelines ni
el feed de Money Maker. El token no va en git.

## Alta de King (operación)

1. Completar en el entorno (local / Railway) las vars `KOMMO_KING_*`. **No pegar valores en chat.**
2. Correr migración `0014_clients` (`npm run db:migrate`).
3. En el dashboard, selector **Cliente → King**.
4. Por BM → alta automática (crea pipeline en la Kommo de King).
5. En Kommo King, apuntar el webhook de cambio de etapa a `/webhook/kommo/king`.

El worker arranca un reloj por cada BM activo de **todos** los clientes.
