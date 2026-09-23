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
import {
  api,
  usePolling,
  type ClienteEtiqueta,
  type KpiFila,
  type KpiLista,
  type LogFiltro,
} from "../api";
import { Card } from "../components/ui";
import { useTheme } from "../lib/theme";
import { useClient } from "../lib/client";

const COLORS = {
  enviados: "#7c5cff",
  si: "#10b981",
  no: "#f59e0b",
  errores: "#f43f5e",
};

export default function FunnelView() {
  const { clientId } = useClient();
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
  const [cliente, setCliente] = useState(""); // "" = todos (por etiqueta)
  const [clientesEtq, setClientesEtq] = useState<ClienteEtiqueta[]>([]);
  useEffect(() => {
    api.clientesEtiqueta().then(setClientesEtq).catch(() => {});
  }, []);
  const filtro = useMemo<LogFiltro>(
    () => ({
      desde: desde ? `${desde}T00:00:00` : undefined,
      hasta: hasta ? `${hasta}T23:59:59` : undefined,
      client: clientId,
      etiqueta: cliente || undefined,
    }),
    [desde, hasta, clientId, cliente]
  );
  const rango = !!(desde || hasta);

  const { data, refresh, loading, error } = usePolling<KpiFila[]>(
    () => api.kpisRango(filtro),
    12000
  );
  const listasQ = usePolling<KpiLista[]>(() => api.kpisListas(filtro), 12000);
  useEffect(() => {
    refresh();
    listasQ.refresh();
  }, [filtro, refresh, listasQ.refresh]);

  const kpis = data ?? [];
  const porBm = kpis.filter((k) => k.bmId !== "TOTAL");
  const total = kpis.find((k) => k.bmId === "TOTAL");
  const filasLista = listasQ.data ?? [];
  const listas = filasLista.filter((k) => k.lista !== "TOTAL");
  const listaTotal = filasLista.find((k) => k.lista === "TOTAL");

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
          <select
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            title="Cliente (por etiqueta)"
            className="rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="">Todos los clientes</option>
            {clientesEtq.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
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
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="w-[12%] px-4 py-3 font-medium">BM</th>
                <th className="w-[11%] px-3 py-3 text-right font-medium">Enviados</th>
                <th className="w-[16%] px-3 py-3 text-right font-medium leading-tight">
                  Enviados
                  <span className="block font-medium normal-case tracking-normal text-faint">
                    sin error
                  </span>
                </th>
                <th className="w-[10%] px-3 py-3 text-right font-medium">SI</th>
                <th className="w-[10%] px-3 py-3 text-right font-medium">NO</th>
                <th className="w-[11%] px-3 py-3 text-right font-medium">ERROR</th>
                <th className="w-[15%] px-3 py-3 text-right font-medium">% error</th>
                <th className="w-[15%] px-3 py-3 text-right font-medium">% conv.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {porBm.map((k) => (
                <tr key={k.bmId} className="text-fg transition-colors hover:bg-surface-2">
                  <td className="px-4 py-3 font-semibold">{k.bmId}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{k.enviados}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-fg">
                    {Math.max(0, k.enviados - k.errores)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-300">{k.si}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-300">{k.no}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-rose-600 dark:text-rose-300">{k.errores}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${k.pctError > 15 ? "text-rose-600 dark:text-rose-300" : k.pctError > 10 ? "text-amber-600 dark:text-amber-300" : "text-muted"}`}>
                    {k.pctError}%
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted">{k.pctSi}%</td>
                </tr>
              ))}
              {total && (
                <tr className="bg-surface-2 font-semibold text-fg">
                  <td className="px-4 py-3">TOTAL</td>
                  <td className="px-3 py-3 text-right tabular-nums">{total.enviados}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {Math.max(0, total.enviados - total.errores)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-300">{total.si}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-300">{total.no}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-rose-600 dark:text-rose-300">{total.errores}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{total.pctError}%</td>
                  <td className="px-3 py-3 text-right tabular-nums">{total.pctSi}%</td>
                </tr>
              )}
              {porBm.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-faint">
                    Sin actividad registrada hoy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4">
          <h3 className="text-sm font-semibold text-fg">Detalle por lista</h3>
          <p className="mt-1 text-xs text-faint">
            Etiqueta de Kommo al importar. Un mismo BM puede tener varias listas.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="w-[22%] px-4 py-3 font-medium">Lista</th>
                <th className="w-[10%] px-3 py-3 font-medium">BM</th>
                <th className="w-[10%] px-3 py-3 text-right font-medium">Enviados</th>
                <th className="w-[12%] px-3 py-3 text-right font-medium leading-tight">
                  Enviados
                  <span className="block font-medium normal-case tracking-normal text-faint">
                    sin error
                  </span>
                </th>
                <th className="w-[8%] px-3 py-3 text-right font-medium">SI</th>
                <th className="w-[8%] px-3 py-3 text-right font-medium">NO</th>
                <th className="w-[10%] px-3 py-3 text-right font-medium">ERROR</th>
                <th className="w-[10%] px-3 py-3 text-right font-medium">% error</th>
                <th className="w-[10%] px-3 py-3 text-right font-medium">% conv.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {listas.map((k) => (
                <tr key={k.lista} className="text-fg transition-colors hover:bg-surface-2">
                  <td className="truncate px-4 py-3 font-semibold">{k.lista}</td>
                  <td className="px-3 py-3 text-muted">{k.bms || "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{k.enviados}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {Math.max(0, k.enviados - k.errores)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-300">{k.si}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-300">{k.no}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-rose-600 dark:text-rose-300">{k.errores}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${k.pctError > 15 ? "text-rose-600 dark:text-rose-300" : k.pctError > 10 ? "text-amber-600 dark:text-amber-300" : "text-muted"}`}>
                    {k.pctError}%
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted">{k.pctSi}%</td>
                </tr>
              ))}
              {listaTotal && (
                <tr className="bg-surface-2 font-semibold text-fg">
                  <td className="px-4 py-3">TOTAL</td>
                  <td className="px-3 py-3 text-muted">—</td>
                  <td className="px-3 py-3 text-right tabular-nums">{listaTotal.enviados}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {Math.max(0, listaTotal.enviados - listaTotal.errores)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-300">{listaTotal.si}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-300">{listaTotal.no}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-rose-600 dark:text-rose-300">{listaTotal.errores}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{listaTotal.pctError}%</td>
                  <td className="px-3 py-3 text-right tabular-nums">{listaTotal.pctSi}%</td>
                </tr>
              )}
              {listas.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-faint">
                    Sin etiquetas en el período. La lista se toma de la etiqueta
                    de Kommo al enviar.
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
