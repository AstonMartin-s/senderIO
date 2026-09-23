# CONTRACT_MAP — SenderIO (costuras cross-repo)

Costuras que cruzan instancias/repos. Actualizar en el mismo cambio que
modifique la superficie pública + R1 al dueño.

## SND ↔ WAC (wa-checker) — embed de UI

- **Tipo:** dependencia visual (iframe), sin contrato de datos/API.
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
- **Ref:** MSG-WAC-20260922-1 · PR SenderIO #1 · wa-checker main 95fe4d0.
