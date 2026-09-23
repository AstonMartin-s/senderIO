import { useRef, useState } from "react";
import { Card, Button } from "../components/ui";
import { IconCheck, IconRefresh } from "../components/icons";

// URL del servicio wa-checker (verificador de WhatsApp + limpiador + match).
// Se puede sobrescribir con VITE_WACHECKER_URL en el build del dashboard.
const WACHECKER_URL =
  (import.meta.env.VITE_WACHECKER_URL as string | undefined) ??
  "https://wa-checker.up.railway.app";

export default function VerificadorView() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  function reload() {
    setLoading(true);
    setNonce((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/12 text-brand-500 dark:text-brand-300">
            <IconCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-fg">
              Verificador WA
            </h1>
            <p className="text-[13px] text-muted">
              Limpiar · Verificar · Match — verificación de números en WhatsApp
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reload} title="Recargar">
            <IconRefresh className="h-4 w-4" /> Recargar
          </Button>
          <a href={WACHECKER_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="default" size="sm">
              Abrir en pestaña ↗
            </Button>
          </a>
        </div>
      </div>

      {/* Iframe embebido */}
      <Card className="relative h-[calc(100vh-9.5rem)] min-h-[520px] overflow-hidden p-0">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand-500" />
            <p className="text-sm text-muted">Cargando verificador…</p>
          </div>
        )}
        <iframe
          key={nonce}
          ref={iframeRef}
          src={WACHECKER_URL}
          title="Verificador WA"
          className="h-full w-full border-0"
          onLoad={() => setLoading(false)}
          allow="clipboard-write"
        />
      </Card>
    </div>
  );
}
