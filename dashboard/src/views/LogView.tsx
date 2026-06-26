import { useEffect, useMemo, useState } from "react";
import {
  api,
  usePolling,
  type Bm,
  type KpiFila,
  type LogFiltro,
  type Movimiento,
} from "../api";
import { Card } from "../components/ui";
import { IconDownload } from "../components/icons";
import { clockHHmm } from "../lib/format";

const accionMeta: Record<string, { label: string; cls: string }> = {
  movido_a_envio: { label: "Movido a envío", cls: "bg-brand-500/12 text-brand-600 dark:text-brand-300" },
  resultado_si: { label: "Resultado SI", cls: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" },
  resultado_no: { label: "Resultado NO", cls: "bg-amber-500/12 text-amber-600 dark:text-amber-300" },
  resultado_error: { label: "Resultado ERROR", cls: "bg-rose-500/12 text-rose-600 dark:text-rose-300" },
  pausa_bm: { label: "Pausa BM", cls: "bg-surface-2 text-muted" },
};

export default function LogView() {
  const [bm, setBm] = useState<string>("");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");

  const filtro = useMemo<LogFiltro>(
    () => ({
      bm: bm || undefined,
      desde: desde ? `${desde}T00:00:00` : undefined,
      hasta: hasta ? `${hasta}T23:59:59` : undefined,
    }),
    [bm, desde, hasta]
  );

  const bmsQ = usePolling<Bm[]>(api.bms, 10000);
  const kpiQ = usePolling<KpiFila[]>(api.kpisHoy, 4000);
  const { data, refresh } = usePolling<Movimiento[]>(
    () => api.movimientos(500, filtro),
    3000
  );
  // Refrescá al instante cuando cambia algún filtro (sin esperar al próximo poll).
  useEffect(() => {
    refresh();
  }, [filtro, refresh]);

  const rows = data ?? [];
  const bms = bmsQ.data ?? [];
  const total =
    (kpiQ.data ?? []).find((k) => k.bmId === "TOTAL") ??
    ({ enviados: 0, si: 0, no: 0, errores: 0, pctError: 0, pctSi: 0 } as KpiFila);

  return (
    <div className="space-y-5">
      {/* Estadísticas del día */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Enviados hoy" value={total.enviados} tone="brand" />
        <Stat label="Sí" value={total.si} tone="ok" />
        <Stat label="No" value={total.no} tone="warn" />
        <Stat label="Errores" value={total.errores} tone="bad" />
        <Stat label="% error" value={`${total.pctError}%`} tone="bad" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-fg">
              Historial de movimientos
            </h3>
            <span className="flex items-center gap-1.5 text-xs text-faint">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-500" />
              en vivo
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bm}
              onChange={(e) => setBm(e.target.value)}
              className="rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">Todos los BMs</option>
              {bms.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              title="Desde"
              className="rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
            />
            <span className="text-xs text-faint">→</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              title="Hasta"
              className="rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
            />
            {(desde || hasta || bm) && (
              <button
                onClick={() => {
                  setBm("");
                  setDesde("");
                  setHasta("");
                }}
                className="rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-surface-2"
              >
                Limpiar
              </button>
            )}
            <a
              href={api.movimientosCsvUrl(filtro)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-fg ring-1 ring-line-strong transition-all hover:bg-surface-2"
            >
              <IconDownload className="h-3.5 w-3.5" /> Descargar CSV
            </a>
          </div>
        </div>
        <div className="max-h-[64vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface/90 backdrop-blur">
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="px-5 py-2.5 font-medium">Hora</th>
                <th className="px-2 py-2.5 font-medium">BM</th>
                <th className="px-2 py-2.5 font-medium">Acción</th>
                <th className="px-2 py-2.5 font-medium">Lead</th>
                <th className="px-5 py-2.5 text-right font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m) => {
                const meta = accionMeta[m.accion] ?? {
                  label: m.accion,
                  cls: "bg-surface-2 text-muted",
                };
                return (
                  <tr key={m.id} className="transition-colors hover:bg-surface-2">
                    <td className="w-20 px-5 py-3 tabular-nums text-faint">
                      {clockHHmm(m.ts)}
                    </td>
                    <td className="w-16 px-2 py-3 font-semibold text-fg">
                      {m.bmId}
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-muted tabular-nums">
                      {m.leadId ? `lead ${m.leadId}` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-faint">
                      {m.resultado ?? ""}
                      {m.etapaDestino ? ` · → ${m.etapaDestino}` : ""}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-faint"
                  >
                    Sin movimientos todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "brand" | "ok" | "warn" | "bad" | "neutral";
}) {
  const colors = {
    brand: "text-brand-500 dark:text-brand-300",
    ok: "text-emerald-600 dark:text-emerald-300",
    warn: "text-amber-600 dark:text-amber-300",
    bad: "text-rose-600 dark:text-rose-300",
    neutral: "text-fg",
  };
  return (
    <Card className="px-4 py-3">
      <p className={`text-2xl font-bold tabular-nums ${colors[tone]}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-faint">{label}</p>
    </Card>
  );
}
