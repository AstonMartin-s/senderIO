import { api, usePolling, type Bm, type KpiFila } from "../api";
import { Card, StatCard, ProgressBar, Dot } from "../components/ui";
import { IconSend, IconCheck, IconAlert, IconLayers } from "../components/icons";
import { estadoBm, estadoMeta, timeAgo } from "../lib/format";

export default function Overview() {
  const bmsQ = usePolling<Bm[]>(api.bms, 8000);
  const kpiQ = usePolling<KpiFila[]>(api.kpisHoy, 10000);

  const bms = bmsQ.data ?? [];
  const kpis = kpiQ.data ?? [];
  const total = kpis.find((k) => k.bmId === "TOTAL");

  const activos = bms.filter((b) => b.activo && !b.pausado).length;
  const pausados = bms.filter((b) => b.activo && b.pausado).length;
  const inactivos = bms.filter((b) => !b.activo).length;
  const sinLeads = bms.filter((b) => b.activo && b.sinLeads);

  const enviados = total?.enviados ?? 0;
  const errores = total?.errores ?? 0;
  const si = total?.si ?? 0;
  const pctError = total?.pctError ?? 0;
  const pctSi = total?.pctSi ?? 0;

  const capacidad = bms
    .filter((b) => b.activo)
    .reduce(
      (acc, b) => {
        acc.usado += b.enviadosHoy;
        acc.limite += b.limiteDiario;
        return acc;
      },
      { usado: 0, limite: 0 }
    );

  const errColor =
    pctError > 15
      ? "text-rose-600 dark:text-rose-300"
      : pctError > 10
        ? "text-amber-600 dark:text-amber-300"
        : "text-emerald-600 dark:text-emerald-300";

  return (
    <div className="space-y-6">
      {sinLeads.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5">
          <IconAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
          <div className="text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-200">
              Sin leads en la base de origen
            </p>
            <p className="mt-0.5 text-amber-700/80 dark:text-amber-200/80">
              {sinLeads
                .map(
                  (b) =>
                    `${b.id} (${b.sinLeadsDesde ? timeAgo(b.sinLeadsDesde) : "ahora"})`
                )
                .join(" · ")}{" "}
              — el goteo está activo pero no hay leads para enviar. Cargá leads en
              la etapa de origen.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Enviados hoy"
          value={enviados}
          sub={`${capacidad.usado} / ${capacidad.limite} de la capacidad activa`}
          icon={<IconSend className="h-5 w-5" />}
        />
        <StatCard
          label="% Error 3132 (global)"
          value={<span className={errColor}>{pctError}%</span>}
          sub="Banda sana 5–10% · alerta >15%"
          accent="bg-amber-500/12 text-amber-600 dark:text-amber-300"
          icon={<IconAlert className="h-5 w-5" />}
        />
        <StatCard
          label="Conversión SI"
          value={`${pctSi}%`}
          sub={`${si} respuestas afirmativas`}
          accent="bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
          icon={<IconCheck className="h-5 w-5" />}
        />
        <StatCard
          label="BMs"
          value={
            <span className="flex items-baseline gap-2">
              {activos}
              <span className="text-base font-medium text-faint">
                / {bms.length}
              </span>
            </span>
          }
          sub={`${pausados} pausados · ${inactivos} inactivos`}
          accent="bg-brand-500/12 text-brand-500 dark:text-brand-300"
          icon={<IconLayers className="h-5 w-5" />}
        />
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg">
            Capacidad usada hoy
          </h3>
          <span className="text-sm text-muted tabular-nums">
            {capacidad.usado} / {capacidad.limite} envíos
          </span>
        </div>
        <ProgressBar value={capacidad.usado} max={capacidad.limite} />
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4">
          <h3 className="text-sm font-semibold text-fg">Estado por BM</h3>
        </div>
        <div className="divide-y divide-line">
          {bms.map((bm) => {
            const est = estadoBm(bm);
            const meta = estadoMeta[est];
            return (
              <div
                key={bm.id}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2"
              >
                <div className="flex w-28 items-center gap-2.5">
                  <Dot
                    className={`${meta.dot} ${
                      est === "activo" ? "animate-pulse-dot" : ""
                    }`}
                  />
                  <span className="font-semibold text-fg">{bm.id}</span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.soft} ${meta.text}`}
                >
                  {meta.label}
                </span>
                {bm.activo && bm.sinLeads && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-300">
                    Sin leads
                  </span>
                )}
                <div className="ml-auto flex items-center gap-8 text-sm">
                  <div className="hidden w-40 sm:block">
                    <ProgressBar
                      value={bm.enviadosHoy}
                      max={bm.limiteDiario}
                    />
                  </div>
                  <span className="w-20 text-right tabular-nums text-muted">
                    {bm.enviadosHoy}/{bm.limiteDiario}
                  </span>
                  <span
                    className={`w-16 text-right tabular-nums ${
                      Number(bm.pctErrorMovil) > 15
                        ? "text-rose-600 dark:text-rose-300"
                        : Number(bm.pctErrorMovil) > 10
                          ? "text-amber-600 dark:text-amber-300"
                          : "text-muted"
                    }`}
                  >
                    {bm.pctErrorMovil}%
                  </span>
                </div>
              </div>
            );
          })}
          {bms.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-faint">
              Sin BMs cargados.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
