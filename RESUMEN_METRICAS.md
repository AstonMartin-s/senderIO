# Resumen de métricas — SenderIO

> Generado: **26/06/2026**. Corte de datos: **hasta el 25/06/2026 inclusive**.
> Plataforma: `mooney` · Origen de base: interna (`crm`).

---

## 1. Datos generados por el orquestador (SenderIO)

Movimientos producidos por el sistema desde que está en modo real (envíos =
leads movidos a la etapa de envío; SI/NO/ERROR = resultado vía webhook de Kommo).

| BM | Plantilla | Enviados | SI | NO | ERROR | % error | % conversión (SI) |
|----|-----------|---------:|---:|---:|------:|--------:|------------------:|
| **BM1** | `SPnumero1A` | 10 | 4 | 0 | 1 | 20.00 % | 40.00 % |
| **BM3** | `Spnumero3C` | 18 | 4 | 0 | 3 | 42.86 % | 22.22 % |
| **TOTAL** | — | **28** | **8** | **0** | **4** | **33.33 %** | **28.57 %** |

- Filas registradas en el log hasta ayer: **40**.
- Costo aproximado de estos envíos (entregados, a 0,0618 USD c/u): **≈ 1,48 USD**
  (24 envíos cobrables = 28 enviados − 4 con error).
- **Nota:** el `% error` alto es esperable en este arranque por volumen bajo (cada
  error pesa mucho sobre pocos envíos). BM3 venía con racha de errores; conviene
  vigilar la calidad de la base antes de subir el volumen.

---

## 2. Histórico de la cuenta de WhatsApp (Meta / WhatsApp Manager)

Datos de los exports `message_metrics` y `pmp_metrics` (universo completo de la
cuenta, incluye envíos previos a SenderIO y gestión manual; **no** son solo del
orquestador).

| Número | Período | Enviados | Entregados | % entrega | Recibidos |
|--------|---------|---------:|-----------:|----------:|----------:|
| **BM1** | 07/05 → 26/06 | 3.197 | 3.042 | 95.2 % | 1.260 |
| **BM2** *(restringido)* | 16/05 → 04/06 | 1.172 | 1.091 | 93.1 % | 314 |
| **BM3** | 19/05 → 26/06 | 2.208 | 2.075 | 94.0 % | 847 |
| **TOTAL** | — | **6.577** | **6.208** | **94.4 %** | **2.421** |

---

## 3. Costos (Marketing-lite, "De pago")

| Número | Volumen de pago | Cargo total | Costo unitario |
|--------|----------------:|------------:|---------------:|
| **BM1** | 1.857 | 114,74 USD | 0,06179 USD |
| **BM2** *(restringido)* | 794 | 49,06 USD | 0,06179 USD |
| **BM3** | 1.342 | 82,93 USD | 0,06180 USD |
| **TOTAL** | **3.993** | **246,73 USD** | **≈ 0,0618 USD** |

> El costo por mensaje es prácticamente constante (**0,0618 USD**), valor que el
> sistema usa para completar la columna `costo` del export de trazabilidad.
> Los mensajes de "Servicio" (atención al cliente) son gratuitos (0,00 USD).

---

## 4. Notas y limitaciones

- **`ts_entregado` (doble tick):** no disponible en SenderIO. Ese dato lo tiene
  Meta y requiere el webhook de *delivery* de la API de WhatsApp, que hoy no
  llega a este sistema.
- **`telefono` y `segmento`:** se capturan desde Kommo en cada **envío nuevo**.
  Los envíos previos a esta función no los tienen (no se guardaban).
- **Métricas de Meta vs. SenderIO:** las tablas de las secciones 2 y 3 reflejan
  toda la actividad de la cuenta de WhatsApp; la sección 1 es solo lo orquestado
  por SenderIO. Por eso los volúmenes no coinciden.
- **BM2** figura como *restringido* y **BM4** está en revisión por alta tasa de
  fallo (pendiente de reajuste).
