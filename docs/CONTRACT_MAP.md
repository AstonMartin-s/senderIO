# CONTRACT_MAP — SenderIO (costuras cross-repo)

Costuras que cruzan instancias/repos. Actualizar en el mismo cambio que
modifique la superficie pública + R1 al dueño.

## SND ↔ WAC (wa-checker) — embed de UI

- **Tipo:** iframe del verificador, más un cruce de teléfonos.
- **Cruce:** `POST /api/errores/cruce` con `Authorization: Bearer`.
  Body `{ telefonos: string[] }` (máximo 20.000). Respuesta `{ anulados }`
  con los mismos valores que ya tuvieron error en el log de SenderIO.
  No devuelve el log entero. Sin token configurado → 503.
  Variable en SenderIO: `ERRORES_CRUCE_TOKEN`. En wa-checker:
  `SND_ERRORES_URL` y `SND_ERRORES_TOKEN`.
- **UI:** en el paso Verificar, el tick «Comparar con logs de errores»
  saca esos números de la tanda antes de consultar WhatsApp. Si el cruce
  no responde, la tanda no arranca.
- **Dónde:** `dashboard/src/views/VerificadorView.tsx` (sección "Verificador WA").
- **Variable de build:** `VITE_WACHECKER_URL`
  (default `https://wa-checker.up.railway.app`).
- **Requisito del embed:** wa-checker NO envía `X-Frame-Options` ni
  `CSP frame-ancestors` → es embebible. Si SenderIO agrega helmet/CSP,
  coordinar con WAC antes (rompería el iframe).
- **Aislamiento:** el backend WhatsApp/Chromium vive solo en el servicio
  wa-checker (Railway). SenderIO no ejecuta ese backend → sin costo ni
  riesgo extra en el servicio siempre-activo.
- **Cambio de dominio del wa-checker** → WAC avisa a SND (R1) para
  actualizar `VITE_WACHECKER_URL` y esta entrada.
- **Ref:** MSG-WAC-20260922-1 · MSG-SND-20261019-WAC-1 · MSG-WAC-20261019-1
  (ACK, wa-checker `603aeb7`). El token quedó en los dos servicios.

## SND ↔ TOB (TrackerIO) — embed del panel de operación

- **Tipo:** iframe del panel de Sender dentro de la sidebar admin de Tracker.
  Sin contrato de datos. El selector de cliente de Tracker no viaja.
- **Orígenes permitidos (`CSP frame-ancestors`):**
  `https://panel.trackerapp.site` y
  `https://tobyap-production.up.railway.app`.
- **Rutas (sin credenciales en la URL):**
  `https://senderio-production.up.railway.app/embed/overview`
  `/embed/bms` `/embed/plantillas` `/embed/funnel` `/embed/log`
  `/embed/clientes` `/embed/verificador`.
- **Auth:** el navegador no manda Basic. Sender entrega la página si el
  Referer es uno de esos orígenes y deja una cookie de sesión para el API
  del mismo origen. El panel suelto (`/`) sigue pidiendo Basic.
- **Chrome:** el embed no muestra la sidebar de Sender. El selector Kommo
  queda dentro.
- **Ref:** MSG-SND-20261015-TOB-1 · MSG-TOB-20261016-SND-1.
