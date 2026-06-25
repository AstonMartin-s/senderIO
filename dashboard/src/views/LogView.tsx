import { api, usePolling, type Movimiento } from "../api";
import { Card } from "../components/ui";
import { clockHHmm } from "../lib/format";

const accionMeta: Record<string, { label: string; cls: string }> = {
  movido_a_envio: { label: "Movido a envío", cls: "bg-brand-50 text-brand-600" },
  resultado_si: { label: "Resultado SI", cls: "bg-emerald-50 text-emerald-700" },
  resultado_no: { label: "Resultado NO", cls: "bg-amber-50 text-amber-700" },
  resultado_error: { label: "Resultado ERROR", cls: "bg-rose-50 text-rose-700" },
  pausa_bm: { label: "Pausa BM", cls: "bg-slate-200 text-slate-700" },
};

export default function LogView() {
  const { data } = usePolling<Movimiento[]>(() => api.movimientos(80), 3000);
  const rows = data ?? [];

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-900">
          Movimientos en vivo
        </h3>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-500" />
          actualiza cada 3s
        </span>
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
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
                <td className="px-5 py-12 text-center text-slate-400">
                  Sin movimientos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
