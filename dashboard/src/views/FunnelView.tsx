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
import { api, usePolling, type KpiFila } from "../api";
import { Card } from "../components/ui";

const COLORS = {
  enviados: "#3b6fe0",
  si: "#10b981",
  no: "#f59e0b",
  errores: "#f43f5e",
};

export default function FunnelView() {
  const { data } = usePolling<KpiFila[]>(api.kpisHoy, 5000);
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">
            Embudo consolidado (hoy)
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef0f4" />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#94a3b8" }} />
                <YAxis
                  type="category"
                  dataKey="etapa"
                  tick={{ fontSize: 12, fill: "#475569" }}
                  width={70}
                />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    fontSize: 13,
                  }}
                />
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
          <h3 className="mb-4 text-sm font-semibold text-slate-900">
            Resultados por BM (hoy)
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porBm} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f4" />
                <XAxis dataKey="bmId" tick={{ fontSize: 12, fill: "#475569" }} />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    fontSize: 13,
                  }}
                />
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
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Detalle por BM
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">BM</th>
                <th className="px-5 py-3 text-right font-medium">Enviados</th>
                <th className="px-5 py-3 text-right font-medium">SI</th>
                <th className="px-5 py-3 text-right font-medium">NO</th>
                <th className="px-5 py-3 text-right font-medium">ERROR</th>
                <th className="px-5 py-3 text-right font-medium">% error</th>
                <th className="px-5 py-3 text-right font-medium">% conv.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {porBm.map((k) => (
                <tr key={k.bmId} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-semibold text-slate-800">{k.bmId}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{k.enviados}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-emerald-600">{k.si}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-amber-600">{k.no}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-rose-600">{k.errores}</td>
                  <td className={`px-5 py-3 text-right tabular-nums ${k.pctError > 15 ? "text-rose-600" : k.pctError > 10 ? "text-amber-600" : "text-slate-500"}`}>
                    {k.pctError}%
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-600">{k.pctSi}%</td>
                </tr>
              ))}
              {total && (
                <tr className="bg-slate-50/70 font-semibold">
                  <td className="px-5 py-3 text-slate-900">TOTAL</td>
                  <td className="px-5 py-3 text-right tabular-nums">{total.enviados}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-emerald-600">{total.si}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-amber-600">{total.no}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-rose-600">{total.errores}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{total.pctError}%</td>
                  <td className="px-5 py-3 text-right tabular-nums">{total.pctSi}%</td>
                </tr>
              )}
              {porBm.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
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
