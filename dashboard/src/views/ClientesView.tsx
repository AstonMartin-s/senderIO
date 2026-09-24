import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminClienteApi,
  api,
  type ClientePaqueteRow,
  type ClientePanelResp,
  type ReconcileEtiqueta,
  type ResumenClienteEtiqueta,
  type TrazaNumero,
} from "../api";
import { parseCsv } from "../lib/csv";
import { Button, Card, ProgressBar, StatCard } from "../components/ui";
import { IconCheck, IconDownload, IconRefresh } from "../components/icons";

const ESTADO: Record<TrazaNumero["estado"], string> = {
  enviado: "Enviado",
  respondio_si: "Respondió SÍ",
  respondio_no: "Respondió NO",
  error: "Error",
  pendiente: "Pendiente",
};

function Campo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-fg">
        {value.trim() ? value : "—"}
      </p>
    </div>
  );
}

function Uploader({
  titulo,
  count,
  csvUrl,
  onUpload,
}: {
  titulo: string;
  count: number;
  csvUrl: string;
  onUpload: (
    filas: {
      telefonoRaw: string | null;
      nombre: string | null;
      extra: Record<string, string> | null;
    }[]
  ) => Promise<string>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function procesar(raw: string) {
    const filas = parseCsv(raw);
    if (!filas.length) {
      setMsg("No se detectaron filas.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await onUpload(filas));
      setTexto("");
    } catch (e) {
      setMsg(`Error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-fg">{titulo}</h3>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted tabular-nums">
          {count}
        </span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await procesar(await f.text());
          if (fileRef.current) fileRef.current.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          Subir CSV
        </Button>
        <a
          href={csvUrl}
          className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-xs font-medium text-fg ring-1 ring-line-strong hover:bg-surface-2"
        >
          <IconDownload className="h-4 w-4" /> Bajar CSV
        </a>
      </div>
      <textarea
        className="mt-3 min-h-[72px] w-full rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg ring-1 ring-line outline-none focus:ring-brand-500"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="…o pegá números (uno por línea o CSV)"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          onClick={() => procesar(texto)}
          disabled={busy || !texto.trim()}
        >
          {busy ? "Cargando…" : "Cargar"}
        </Button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </Card>
  );
}

export default function ClientesView() {
  const [lista, setLista] = useState<ClientePaqueteRow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [data, setData] = useState<ClientePanelResp | null>(null);
  const [traza, setTraza] = useState<TrazaNumero[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenClienteEtiqueta[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [kommo, setKommo] = useState<ReconcileEtiqueta | null>(null);
  const [kommoBusy, setKommoBusy] = useState(false);
  const [kommoErr, setKommoErr] = useState<string | null>(null);

  const reconciliarKommo = useCallback(async (id: string) => {
    setKommoBusy(true);
    setKommoErr(null);
    setKommo(null);
    try {
      setKommo(await api.clienteEtiquetaKommo(id));
    } catch (e) {
      setKommoErr(String((e as Error).message ?? e));
    } finally {
      setKommoBusy(false);
    }
  }, []);

  const cargarLista = useCallback(async () => {
    const [rows, res] = await Promise.all([
      adminClienteApi.list(),
      api
        .clientesEtiquetaResumen({
          desde: desde ? `${desde}T00:00:00` : undefined,
          hasta: hasta ? `${hasta}T23:59:59` : undefined,
        })
        .catch(() => [] as ResumenClienteEtiqueta[]),
    ]);
    setLista(rows);
    setResumen(res);
    setSel((cur) => cur ?? rows[0]?.id ?? null);
  }, [desde, hasta]);

  const cargarDetalle = useCallback(async (id: string) => {
    const [d, t] = await Promise.all([
      adminClienteApi.detalle(id),
      adminClienteApi.traza(id),
    ]);
    setData(d);
    setTraza(t);
  }, []);

  useEffect(() => {
    cargarLista().catch((e) => setErr(String(e.message ?? e)));
  }, [cargarLista]);

  useEffect(() => {
    if (!sel) return;
    setKommo(null);
    setKommoErr(null);
    cargarDetalle(sel).catch((e) => setErr(String(e.message ?? e)));
  }, [sel, cargarDetalle]);

  const p = data?.panel;
  const pq = data?.paquete;
  const rango = !!(desde || hasta);
  const periodoLabel = rango
    ? `${desde || "…"} → ${hasta || "…"}`
    : "hoy";
  const metSel = resumen.find((r) => r.id === sel);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-fg">Clientes</h2>
          <p className="text-xs text-faint">
            Pantalla del cliente, bases y lo que cargó. Sin datos de BM.
          </p>
        </div>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => {
            cargarLista();
            if (sel) cargarDetalle(sel);
          }}
        >
          <IconRefresh className="h-4 w-4" /> Actualizar
        </Button>
      </div>

      {err && <p className="text-sm text-rose-400">{err}</p>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-fg">
              Métricas por etiqueta ({periodoLabel})
            </h3>
            <p className="mt-1 text-[11px] text-faint">
              Lo que el log registró en el período, por etiqueta del envío. El
              tablero de Kommo es el stock actual e incluye días anteriores.
            </p>
          </div>
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 text-right font-medium">Enviados</th>
                <th className="px-3 py-2.5 text-right font-medium">SI</th>
                <th className="px-3 py-2.5 text-right font-medium">NO</th>
                <th className="px-3 py-2.5 text-right font-medium">ERROR</th>
                <th className="px-3 py-2.5 text-right font-medium">% error</th>
                <th className="px-3 py-2.5 text-right font-medium">% conv.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {resumen.map((c) => (
                <tr key={c.id} className="text-fg hover:bg-surface-2">
                  <td className="px-4 py-2.5 font-semibold">
                    {c.nombre}
                    {c.etiquetas.length > 0 && (
                      <span className="ml-2 text-[11px] font-normal text-faint">
                        {c.etiquetas.join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.enviados}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-300">{c.si}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-amber-600 dark:text-amber-300">{c.no}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-rose-600 dark:text-rose-300">{c.errores}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">{c.pctError}%</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">{c.pctSi}%</td>
                </tr>
              ))}
              {!resumen.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-faint">
                    Sin actividad en el período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {lista.map((c) => (
          <button
            key={c.id}
            onClick={() => setSel(c.id)}
            className={`rounded-xl px-4 py-2 text-left ring-1 transition-all ${
              sel === c.id
                ? "bg-brand-500/12 text-fg ring-brand-500/40"
                : "bg-surface text-muted ring-line hover:text-fg"
            }`}
          >
            <span className="block text-sm font-semibold">{c.nombre}</span>
            <span className="text-[11px] text-faint">
              {c.paquete.conTope
                ? `${c.paquete.consumidos}/${c.paquete.total}`
                : `${resumen.find((r) => r.id === c.id)?.enviados ?? 0} envíos`}{" "}
              · cruda {c.bases.baseCruda} · filtrada {c.bases.listaFiltrada}
            </span>
          </button>
        ))}
        {!lista.length && (
          <p className="text-sm text-faint">No hay clientes de paquete.</p>
        )}
      </div>

      {sel && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-fg">
                Estado en Kommo (en vivo)
              </h3>
              <p className="mt-0.5 text-[11px] text-faint">
                Cuenta los leads del tablero por etapa (incluye movimientos
                manuales). Solo lectura; no altera las métricas del log.
              </p>
            </div>
            <Button
              size="sm"
              variant="primary"
              disabled={kommoBusy}
              onClick={() => sel && reconciliarKommo(sel)}
            >
              <IconRefresh className="h-4 w-4" />
              {kommoBusy ? "Consultando…" : "Actualizar desde Kommo"}
            </Button>
          </div>
          {kommoErr && (
            <p className="mt-3 text-sm text-rose-400">{kommoErr}</p>
          )}
          {kommo && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Enviados" value={kommo.enviados} />
              <StatCard label="Respondieron SÍ" value={kommo.si} />
              <StatCard label="Respondieron NO" value={kommo.no} />
              <StatCard label="Error" value={kommo.error} />
            </div>
          )}
          {kommo && (
            <p className="mt-2 text-[11px] text-faint">
              % error {kommo.pctError}% · % conv. {kommo.pctSi}% · {kommo.pipelines}{" "}
              BM con leads de este cliente.
            </p>
          )}
        </Card>
      )}

      {sel && p && pq && (
        <>
          <Card className="p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                  <IconCheck className="h-3.5 w-3.5" />
                  {pq.conTope ? "Paquete activado" : "Conteo de envíos"}
                </span>
                <span className="text-sm font-medium text-fg">
                  {pq.conTope ? `${pq.total} mensajes` : "sin tope"}
                </span>
              </div>
              <span className="text-sm text-muted tabular-nums">
                <span className="font-bold text-fg">
                  {pq.conTope ? pq.consumidos : (metSel?.enviados ?? 0)}
                </span>{" "}
                enviados
                {pq.conTope ? (
                  <>
                    {" "}·{" "}
                    <span className="font-bold text-fg">{pq.restantes}</span>{" "}
                    restantes
                  </>
                ) : (
                  <span className="text-faint"> · {periodoLabel}</span>
                )}
              </span>
            </div>
            {pq.conTope && pq.total != null && (
              <ProgressBar
                value={pq.consumidos}
                max={pq.total}
                className="bg-emerald-500"
              />
            )}
            <p className="mt-2 text-[11px] text-faint">
              {pq.conTope
                ? `Cuenta envíos OK del paquete (enviado + SÍ + NO), sin filtrar por fecha. Los errores no descuentan (${pq.errores} con error).`
                : `Envíos del período (${periodoLabel}). El stock del tablero se ve en «Estado en Kommo».`}
            </p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Base cruda" value={data.bases.baseCruda} />
            <StatCard label="Lista filtrada" value={data.bases.listaFiltrada} />
            <StatCard label="Respondieron SÍ" value={data.resumen.respondio_si} />
            <StatCard label="Pendientes" value={data.resumen.pendiente} />
          </div>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-fg">
              Gestión que cargó el cliente
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <Campo label="Oferta" value={p.ofertaTitulo} />
              <Campo label="Monto USD" value={p.ofertaMontoUsd ?? ""} />
              <Campo label="Detalle de oferta" value={p.ofertaDetalle} />
              <Campo label="Plantilla" value={p.plantillaNombre} />
              <Campo label="Texto que se envía" value={p.mensajeTexto} />
              <Campo
                label="Números de redirección"
                value={p.redirecciones.join("\n")}
              />
              <Campo label="Notas" value={p.notas} />
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Uploader
              titulo="Base cruda"
              count={data.bases.baseCruda}
              csvUrl={adminClienteApi.csvBaseCruda(sel)}
              onUpload={async (filas) => {
                const res = await adminClienteApi.subirBaseCruda(sel, filas);
                await Promise.all([cargarLista(), cargarDetalle(sel)]);
                return `${res.insertados} filas cargadas.`;
              }}
            />
            <Uploader
              titulo="Lista filtrada (wa-checker)"
              count={data.bases.listaFiltrada}
              csvUrl={adminClienteApi.csvListaFiltrada(sel)}
              onUpload={async (filas) => {
                const res = await adminClienteApi.subirListaFiltrada(sel, filas);
                await Promise.all([cargarLista(), cargarDetalle(sel)]);
                return `${res.insertados} cargados${
                  res.descartados ? `, ${res.descartados} sin número válido` : ""
                }.`;
              }}
            />
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-bold text-fg">Trazabilidad por número</h3>
              <a
                href={adminClienteApi.csvTraza(sel)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-xs font-medium text-fg ring-1 ring-line-strong hover:bg-surface-2"
              >
                <IconDownload className="h-4 w-4" /> Bajar CSV
              </a>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface text-left text-xs uppercase tracking-wide text-faint">
                  <tr>
                    <th className="px-4 py-2.5">Número</th>
                    <th className="px-4 py-2.5">Nombre</th>
                    <th className="px-4 py-2.5 text-right">Envíos</th>
                    <th className="px-4 py-2.5 text-right">SI</th>
                    <th className="px-4 py-2.5 text-right">NO</th>
                    <th className="px-4 py-2.5 text-right">Errores</th>
                    <th className="px-4 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {traza.slice(0, 200).map((f) => (
                    <tr key={f.telefono} className="border-t border-line/60">
                      <td className="px-4 py-2 font-mono text-[13px] text-fg">
                        {f.telefono}
                      </td>
                      <td className="px-4 py-2 text-muted">{f.nombre ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{f.envios ?? 0}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-300">{f.si ?? 0}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-amber-600 dark:text-amber-300">{f.no ?? 0}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-rose-600 dark:text-rose-300">{f.errores ?? 0}</td>
                      <td className="px-4 py-2 text-muted">{ESTADO[f.estado]}</td>
                    </tr>
                  ))}
                  {!traza.length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-faint">
                        Sin números en la lista filtrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
