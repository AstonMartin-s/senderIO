import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { api, usePolling, type KpiFila, type LogFiltro } from "../api";
import { Card } from "../components/ui";
import { useTheme } from "../lib/theme";

const COLORS = {
  enviados: "#7c5cff",
  si: "#10b981",
  no: "#f59e0b",
  errores: "#f43f5e",
};

export default function FunnelView() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const axis = dark ? "#9499a8" : "#475569";
  const axisFaint = dark ? "#686d7c" : "#94a3b8";
  const grid = dark ? "rgba(255,255,255,0.08)" : "#eef0f4";
  const tip = {
    borderRadius: 12,
    border: `1px solid ${dark ? "rgba(255,255,255,0.12)" : "#e2e8f0"}`,
    background: dark ? "#15151f" : "#ffffff",
    color: dark ? "#e9eaf2" : "#0f1222",
    fontSize: 13,
  } as const;
  const cursorFill = dark ? "rgba(255,255,255,0.04)" : "#f8fafc";

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const filtro = useMemo<LogFiltro>(
    () => ({
      desde: desde ? `${desde}T00:00:00` : undefined,
      hasta: hasta ? `${hasta}T23:59:59` : undefined,
    }),
    [desde, hasta]
  );
  const rango = !!(desde || hasta);

  const { data, refresh, loading, error } = usePolling<KpiFila[]>(
    () => api.kpisRango(filtro),
    5000
  );
  useEffect(() => {
    refresh();
  }, [filtro, refresh]);

  const kpis = data ?? [];
  const porBm = kpis.filter((k) => k.bmId !== "TOTAL");
  const total = kpis.find((k) => k.bmId === "TOTAL");

  const funnel = [
    { etapa: "Enviados", valor: total?.enviados ?? 0, color: COLORS.enviados },
    { etapa: "SI", valor: total?.si ?? 0, color: COLORS.si },
    { etapa: "NO", valor: total?.no ?? 0, color: COLORS.no },
    { etapa: "ERROR", valor: total?.errores ?? 0, color: COLORS.errores },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">
          {rango ? "Período seleccionado" : "Día en curso (hoy)"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
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
          {rango && (
            <button
              onClick={() => {
                setDesde("");
                setHasta("");
              }}
              className="rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-surface-2"
            >
              Hoy
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {(loading && !total) && (
          <div className="col-span-full px-1 text-sm text-faint">
            Cargando KPIs…
          </div>
        )}
        {error && !total && (
          <div className="col-span-full px-1 text-sm text-rose-600 dark:text-rose-300">
            Error al cargar KPIs: {error}
          </div>
        )}
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-fg">
            Embudo consolidado ({rango ? "período" : "hoy"})
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={grid} />
                <XAxis type="number" tick={{ fontSize: 12, fill: axisFaint }} />
                <YAxis
                  type="category"
                  dataKey="etapa"
                  tick={{ fontSize: 12, fill: axis }}
                  width={70}
                />
                <Tooltip cursor={{ fill: cursorFill }} contentStyle={tip} />
                <Bar dataKey="valor" radius={[0, 6, 6, 0]} barSize={26}>
                  {funnel.map((f, i) => (
                    <Cell key={i} fill={f.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-fg">
            Resultados por BM ({rango ? "período" : "hoy"})
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porBm} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
                <XAxis dataKey="bmId" tick={{ fontSize: 12, fill: axis }} />
                <YAxis tick={{ fontSize: 12, fill: axisFaint }} />
                <Tooltip cursor={{ fill: cursorFill }} contentStyle={tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="si" name="SI" stackId="a" fill={COLORS.si} radius={[0, 0, 0, 0]} />
                <Bar dataKey="no" name="NO" stackId="a" fill={COLORS.no} />
                <Bar dataKey="errores" name="ERROR" stackId="a" fill={COLORS.errores} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <div className="border-b border-line px-5 py-4">
          <h3 className="text-sm font-semibold text-fg">
            Detalle por BM
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                <th className="px-5 py-3 font-medium">BM</th>
                <th className="px-5 py-3 text-right font-medium">Enviados</th>
                <th className="px-5 py-3 text-right font-medium">SI</th>
                <th className="px-5 py-3 text-right font-medium">NO</th>
                <th className="px-5 py-3 text-right font-medium">ERROR</th>
                <th className="px-5 py-3 text-right font-medium">% error</th>
                <th className="px-5 py-3 text-right font-medium">% conv.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {porBm.map((k) => (
                <tr key={k.bmId} className="text-fg transition-colors hover:bg-surface-2">
                  <td className="px-5 py-3 font-semibold">{k.bmId}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{k.enviados}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-300">{k.si}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-amber-600 dark:text-amber-300">{k.no}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-rose-600 dark:text-rose-300">{k.errores}</td>
                  <td className={`px-5 py-3 text-right tabular-nums ${k.pctError > 15 ? "text-rose-600 dark:text-rose-300" : k.pctError > 10 ? "text-amber-600 dark:text-amber-300" : "text-muted"}`}>
                    {k.pctError}%
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted">{k.pctSi}%</td>
                </tr>
              ))}
              {total && (
                <tr className="bg-surface-2 font-semibold text-fg">
                  <td className="px-5 py-3">TOTAL</td>
                  <td className="px-5 py-3 text-right tabular-nums">{total.enviados}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-300">{total.si}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-amber-600 dark:text-amber-300">{total.no}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-rose-600 dark:text-rose-300">{total.errores}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{total.pctError}%</td>
                  <td className="px-5 py-3 text-right tabular-nums">{total.pctSi}%</td>
                </tr>
              )}
              {porBm.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-faint">
                    Sin actividad registrada hoy.
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
