import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminClienteApi,
  type ClientePaqueteRow,
  type ClientePanelResp,
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

  const cargarLista = useCallback(async () => {
    const rows = await adminClienteApi.list();
    setLista(rows);
    setSel((cur) => cur ?? rows[0]?.id ?? null);
  }, []);

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
    cargarDetalle(sel).catch((e) => setErr(String(e.message ?? e)));
  }, [sel, cargarDetalle]);

  const p = data?.panel;
  const pq = data?.paquete;

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
              {c.paquete.consumidos}/{c.paquete.total} · cruda{" "}
              {c.bases.baseCruda} · filtrada {c.bases.listaFiltrada}
            </span>
          </button>
        ))}
        {!lista.length && (
          <p className="text-sm text-faint">No hay clientes de paquete.</p>
        )}
      </div>

      {sel && p && pq && (
        <>
          <Card className="p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                  <IconCheck className="h-3.5 w-3.5" /> Paquete activado
                </span>
                <span className="text-sm font-medium text-fg">
                  {pq.total} mensajes
                </span>
              </div>
              <span className="text-sm text-muted tabular-nums">
                <span className="font-bold text-fg">{pq.consumidos}</span> enviados
                · <span className="font-bold text-fg">{pq.restantes}</span> restantes
              </span>
            </div>
            <ProgressBar
              value={pq.consumidos}
              max={pq.total}
              className="bg-emerald-500"
            />
            <p className="mt-2 text-[11px] text-faint">
              Los errores no descuentan ({pq.errores} con error).
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
                    <th className="px-4 py-2.5">Estado</th>
                    <th className="px-4 py-2.5">Plantilla</th>
                  </tr>
                </thead>
                <tbody>
                  {traza.slice(0, 200).map((f) => (
                    <tr key={f.telefono} className="border-t border-line/60">
                      <td className="px-4 py-2 font-mono text-[13px] text-fg">
                        {f.telefono}
                      </td>
                      <td className="px-4 py-2 text-muted">{f.nombre ?? "—"}</td>
                      <td className="px-4 py-2 text-muted">{ESTADO[f.estado]}</td>
                      <td className="px-4 py-2 text-muted">{f.plantilla ?? "—"}</td>
                    </tr>
                  ))}
                  {!traza.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-faint">
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
