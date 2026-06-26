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
  movido_a_envio: { label: "Movido a envío", cls: "bg-brand-50 text-brand-600" },
  resultado_si: { label: "Resultado SI", cls: "bg-emerald-50 text-emerald-700" },
  resultado_no: { label: "Resultado NO", cls: "bg-amber-50 text-amber-700" },
  resultado_error: { label: "Resultado ERROR", cls: "bg-rose-50 text-rose-700" },
  pausa_bm: { label: "Pausa BM", cls: "bg-slate-200 text-slate-700" },
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Historial de movimientos
            </h3>
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-500" />
              en vivo
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bm}
              onChange={(e) => setBm(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
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
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <span className="text-xs text-slate-400">→</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              title="Hasta"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            {(desde || hasta || bm) && (
              <button
                onClick={() => {
                  setBm("");
                  setDesde("");
                  setHasta("");
                }}
                className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
              >
                Limpiar
              </button>
            )}
            <a
              href={api.movimientosCsvUrl(filtro)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition-all hover:bg-slate-50"
            >
              <IconDownload className="h-3.5 w-3.5" /> Descargar CSV
            </a>
          </div>
        </div>
        <div className="max-h-[64vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50/90 backdrop-blur">
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2.5 font-medium">Hora</th>
                <th className="px-2 py-2.5 font-medium">BM</th>
                <th className="px-2 py-2.5 font-medium">Acción</th>
                <th className="px-2 py-2.5 font-medium">Lead</th>
                <th className="px-5 py-2.5 text-right font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((m) => {
                const meta = accionMeta[m.accion] ?? {
                  label: m.accion,
                  cls: "bg-slate-100 text-slate-600",
                };
                return (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="w-20 px-5 py-3 tabular-nums text-slate-400">
                      {clockHHmm(m.ts)}
                    </td>
                    <td className="w-16 px-2 py-3 font-semibold text-slate-700">
                      {m.bmId}
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-slate-500">
                      {m.leadId ? `lead ${m.leadId}` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-slate-400">
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
                    className="px-5 py-12 text-center text-slate-400"
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
    brand: "text-brand-600",
    ok: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-rose-600",
    neutral: "text-slate-700",
  };
  return (
    <Card className="px-4 py-3">
      <p className={`text-2xl font-bold tabular-nums ${colors[tone]}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-400">{label}</p>
    </Card>
  );
}
