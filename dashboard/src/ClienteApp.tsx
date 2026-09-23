import { useCallback, useEffect, useRef, useState } from "react";
import {
  clienteApi,
  getClienteToken,
  setClienteToken,
  type ClientePanelResp,
  type ClientePanelConfig,
  type TrazaNumero,
} from "./api";
import { parseCsv } from "./lib/csv";
import { Button, Card, StatCard, ProgressBar } from "./components/ui";
import {
  IconSend,
  IconCheck,
  IconAlert,
  IconActivity,
  IconDownload,
  IconRefresh,
  IconMessage,
} from "./components/icons";
import { useTheme } from "./lib/theme";

const ESTADO_LABEL: Record<TrazaNumero["estado"], string> = {
  enviado: "Enviado",
  respondio_si: "Respondió SÍ",
  respondio_no: "Respondió NO",
  error: "Error",
  pendiente: "Pendiente",
};

const ESTADO_CLASS: Record<TrazaNumero["estado"], string> = {
  enviado: "bg-brand-500/12 text-brand-600 dark:text-brand-300",
  respondio_si: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  respondio_no: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  error: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  pendiente: "bg-surface-2 text-muted",
};

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Login ─────────────────────────────────────────────────────────────────────
function Login({ onOk }: { onOk: () => void }) {
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function entrar() {
    setBusy(true);
    setErr(null);
    setClienteToken(token.trim());
    try {
      await clienteApi.panel();
      onOk();
    } catch (e) {
      setErr(
        String(e).includes("401")
          ? "Token inválido."
          : String(e).includes("503")
          ? "El panel todavía no está habilitado."
          : "No se pudo conectar."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white">
            <IconActivity className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-bold text-fg">Panel Cliente</p>
            <p className="text-[11px] text-faint">Acceso privado</p>
          </div>
        </div>
        <label className="mb-1 block text-xs font-semibold text-muted">
          Token de acceso
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && entrar()}
          className="w-full rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg ring-1 ring-line outline-none focus:ring-brand-500"
          placeholder="Pegá tu token"
        />
        {err && <p className="mt-2 text-xs text-rose-500">{err}</p>}
        <Button
          variant="primary"
          onClick={entrar}
          disabled={busy || !token.trim()}
          className="mt-4 w-full justify-center"
        >
          {busy ? "Verificando…" : "Entrar"}
        </Button>
      </Card>
    </div>
  );
}

// ── Recipiente de config (Oferta / Mensaje / Redirecciones) ────────────────────
function ConfigCard({
  panel,
  onSaved,
}: {
  panel: ClientePanelConfig;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(panel);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  useEffect(() => setForm(panel), [panel]);

  const set = <K extends keyof ClientePanelConfig>(
    k: K,
    v: ClientePanelConfig[K]
  ) => setForm((f) => ({ ...f, [k]: v }));

  async function guardar() {
    setBusy(true);
    setOk(false);
    try {
      await clienteApi.savePanel({
        ofertaTitulo: form.ofertaTitulo,
        ofertaDetalle: form.ofertaDetalle,
        ofertaMontoUsd: form.ofertaMontoUsd,
        paqueteTotal: form.paqueteTotal,
        mensajeTexto: form.mensajeTexto,
        plantillaNombre: form.plantillaNombre,
        redirecciones: form.redirecciones,
        notas: form.notas,
      });
      setOk(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg ring-1 ring-line outline-none focus:ring-brand-500";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-fg">Oferta</h3>
        <label className="mb-1 block text-xs text-muted">Título</label>
        <input
          className={inputCls}
          value={form.ofertaTitulo}
          onChange={(e) => set("ofertaTitulo", e.target.value)}
          placeholder="Paquete 250 USD"
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Monto (USD)</label>
            <input
              className={inputCls}
              value={form.ofertaMontoUsd ?? ""}
              onChange={(e) => set("ofertaMontoUsd", e.target.value || null)}
              placeholder="250"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              Paquete (mensajes)
            </label>
            <input
              className={inputCls}
              value={form.paqueteTotal}
              onChange={(e) =>
                set("paqueteTotal", Number(e.target.value) || 0)
              }
              placeholder="500"
              inputMode="numeric"
            />
          </div>
        </div>
        <label className="mb-1 mt-3 block text-xs text-muted">Detalle</label>
        <textarea
          className={`${inputCls} min-h-[90px]`}
          value={form.ofertaDetalle}
          onChange={(e) => set("ofertaDetalle", e.target.value)}
          placeholder="Qué incluye el paquete…"
        />
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-fg">Mensaje / Plantilla</h3>
        <label className="mb-1 block text-xs text-muted">
          Nombre de plantilla
        </label>
        <input
          className={inputCls}
          value={form.plantillaNombre}
          onChange={(e) => set("plantillaNombre", e.target.value)}
          placeholder="nombre_plantilla_meta"
        />
        <label className="mb-1 mt-3 block text-xs text-muted">
          Texto que se envía
        </label>
        <textarea
          className={`${inputCls} min-h-[90px]`}
          value={form.mensajeTexto}
          onChange={(e) => set("mensajeTexto", e.target.value)}
          placeholder="Cuerpo del mensaje…"
        />
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-fg">
          Números de redirección
        </h3>
        <textarea
          className={`${inputCls} min-h-[90px]`}
          value={form.redirecciones.join("\n")}
          onChange={(e) =>
            set(
              "redirecciones",
              e.target.value.split("\n").map((s) => s.trim())
            )
          }
          placeholder="Un número por línea"
        />
        <p className="mt-1 text-[11px] text-faint">
          Uno por línea. Se guardan tal cual.
        </p>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-fg">Notas</h3>
        <textarea
          className={`${inputCls} min-h-[90px]`}
          value={form.notas}
          onChange={(e) => set("notas", e.target.value)}
          placeholder="Notas internas compartidas…"
        />
      </Card>

      <div className="lg:col-span-2 flex items-center gap-3">
        <Button variant="primary" onClick={guardar} disabled={busy}>
          {busy ? "Guardando…" : "Guardar cambios"}
        </Button>
        {ok && (
          <span className="text-xs text-emerald-500">Guardado ✓</span>
        )}
        <span className="ml-auto text-[11px] text-faint">
          Estos campos son informativos: no configuran el envío.
        </span>
      </div>
    </div>
  );
}

// ── Cargador de base (CSV / pegar) ─────────────────────────────────────────────
function Uploader({
  titulo,
  descripcion,
  count,
  onUpload,
}: {
  titulo: string;
  descripcion: string;
  count: number;
  onUpload: (
    filas: { telefonoRaw: string | null; nombre: string | null; extra: Record<string, string> | null }[]
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
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-fg">{titulo}</h3>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted tabular-nums">
          {count} cargados
        </span>
      </div>
      <p className="mb-3 text-[11px] text-faint">{descripcion}</p>
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
      <div className="flex gap-2">
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          <IconDownload className="h-4 w-4 rotate-180" /> Subir CSV
        </Button>
      </div>
      <textarea
        className="mt-3 w-full min-h-[80px] rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg ring-1 ring-line outline-none focus:ring-brand-500"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="…o pegá los números acá (uno por línea o CSV)"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          onClick={() => procesar(texto)}
          disabled={busy || !texto.trim()}
        >
          {busy ? "Cargando…" : "Cargar lista"}
        </Button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </Card>
  );
}

// ── Traza por número ────────────────────────────────────────────────────────
function TrazaTabla({ filas }: { filas: TrazaNumero[] }) {
  const [filtro, setFiltro] = useState<TrazaNumero["estado"] | "todos">("todos");
  const [q, setQ] = useState("");
  const vis = filas.filter(
    (f) =>
      (filtro === "todos" || f.estado === filtro) &&
      (!q || f.telefono.includes(q) || (f.nombre ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar número o nombre…"
          className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-fg ring-1 ring-line outline-none focus:ring-brand-500"
        />
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as typeof filtro)}
          className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-fg ring-1 ring-line outline-none focus:ring-brand-500"
        >
          <option value="todos">Todos</option>
          <option value="enviado">Enviado</option>
          <option value="respondio_si">Respondió SÍ</option>
          <option value="respondio_no">Respondió NO</option>
          <option value="error">Error</option>
          <option value="pendiente">Pendiente</option>
        </select>
        <a
          href={clienteApi.trazaCsvUrl()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-fg ring-1 ring-line-strong hover:bg-surface-2"
        >
          <IconDownload className="h-4 w-4" /> CSV
        </a>
      </div>
      <div className="max-h-[520px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface text-left text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="px-4 py-2.5">Número</th>
              <th className="px-4 py-2.5">Nombre</th>
              <th className="px-4 py-2.5">Estado</th>
              <th className="px-4 py-2.5">Enviado</th>
              <th className="px-4 py-2.5">Última actividad</th>
              <th className="px-4 py-2.5">Plantilla</th>
            </tr>
          </thead>
          <tbody>
            {vis.map((f) => (
              <tr key={f.telefono} className="border-t border-line/60">
                <td className="px-4 py-2.5 font-mono text-[13px] text-fg">
                  {f.telefono}
                </td>
                <td className="px-4 py-2.5 text-muted">{f.nombre ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_CLASS[f.estado]}`}
                  >
                    {ESTADO_LABEL[f.estado]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted tabular-nums">
                  {fmt(f.enviadoAt)}
                </td>
                <td className="px-4 py-2.5 text-muted tabular-nums">
                  {fmt(f.ultimaActividadAt)}
                </td>
                <td className="px-4 py-2.5 text-muted">{f.plantilla ?? "—"}</td>
              </tr>
            ))}
            {!vis.length && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-faint">
                  Sin números para mostrar. Cargá la lista filtrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
type Tab = "resumen" | "bases" | "traza" | "config";

export default function ClienteApp() {
  const { theme, toggle } = useTheme();
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>("resumen");
  const [data, setData] = useState<ClientePanelResp | null>(null);
  const [traza, setTraza] = useState<TrazaNumero[]>([]);

  const cargar = useCallback(async () => {
    const [p, t] = await Promise.all([clienteApi.panel(), clienteApi.traza()]);
    setData(p);
    setTraza(t);
  }, []);

  useEffect(() => {
    if (getClienteToken()) {
      clienteApi
        .panel()
        .then(() => {
          setAuthed(true);
          cargar();
        })
        .catch(() => setAuthed(false));
    }
  }, [cargar]);

  if (!authed) {
    return (
      <Login
        onOk={() => {
          setAuthed(true);
          cargar();
        }}
      />
    );
  }

  const r = data?.resumen;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white">
          <IconActivity className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-fg">
            {data?.panel.ofertaTitulo || "Panel Cliente"}
          </h1>
          <p className="text-[11px] text-faint">Trazabilidad y recipientes</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={cargar}>
            <IconRefresh className="h-4 w-4" /> Actualizar
          </Button>
          <Button size="sm" variant="ghost" onClick={toggle}>
            {theme === "dark" ? "Claro" : "Oscuro"}
          </Button>
        </div>
      </header>

      <nav className="mb-5 flex gap-1 rounded-xl bg-surface-2 p-1">
        {(
          [
            ["resumen", "Resumen"],
            ["traza", "Trazabilidad"],
            ["bases", "Bases"],
            ["config", "Oferta / Mensaje"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              tab === id
                ? "bg-surface text-fg shadow-sm ring-1 ring-line"
                : "text-muted hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "resumen" && data?.paquete && (
        <Card className="mb-4 p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                <IconCheck className="h-3.5 w-3.5" /> Paquete activado
              </span>
              <span className="text-sm font-medium text-fg">
                {data.paquete.conTope ? `${data.paquete.total} mensajes` : "sin tope"}
              </span>
            </div>
            <span className="text-sm text-muted tabular-nums">
              <span className="font-bold text-fg">{data.paquete.consumidos}</span>{" "}
              enviados
              {data.paquete.conTope && (
                <>
                  {" "}·{" "}
                  <span className="font-bold text-fg">
                    {data.paquete.restantes}
                  </span>{" "}
                  restantes
                </>
              )}
            </span>
          </div>
          {data.paquete.conTope && data.paquete.total != null && (
            <ProgressBar
              value={data.paquete.consumidos}
              max={data.paquete.total}
              className="bg-emerald-500"
            />
          )}
          <p className="mt-2 text-[11px] text-faint">
            Se descuenta a medida que se detecta el envío en trazabilidad. Los
            errores no descuentan ({data.paquete.errores} con error).
          </p>
        </Card>
      )}

      {tab === "resumen" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="En lista filtrada"
            value={data?.bases.listaFiltrada ?? 0}
            icon={<IconMessage />}
          />
          <StatCard
            label="Enviados"
            value={r ? r.enviado + r.respondio_si + r.respondio_no + r.error : 0}
            icon={<IconSend />}
          />
          <StatCard
            label="Respondieron SÍ"
            value={r?.respondio_si ?? 0}
            accent="bg-emerald-500/15 text-emerald-500"
            icon={<IconCheck />}
          />
          <StatCard
            label="Errores"
            value={r?.error ?? 0}
            accent="bg-rose-500/15 text-rose-500"
            icon={<IconAlert />}
          />
          <StatCard
            label="Base cruda recibida"
            value={data?.bases.baseCruda ?? 0}
          />
          <StatCard label="Pendientes" value={r?.pendiente ?? 0} />
          <StatCard label="Respondieron NO" value={r?.respondio_no ?? 0} />
          <StatCard
            label="Redirecciones"
            value={data?.panel.redirecciones.length ?? 0}
          />
        </div>
      )}

      {tab === "traza" && <TrazaTabla filas={traza} />}

      {tab === "bases" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Uploader
            titulo="Base cruda (del cliente)"
            descripcion="La base tal cual la entrega el cliente. Reemplaza la anterior."
            count={data?.bases.baseCruda ?? 0}
            onUpload={async (filas) => {
              const res = await clienteApi.subirBaseCruda(filas);
              await cargar();
              return `${res.insertados} filas cargadas.`;
            }}
          />
          <Uploader
            titulo="Lista filtrada (wa-checker)"
            descripcion="La lista ya depurada por el wa-checker final. Es la que se traza por número."
            count={data?.bases.listaFiltrada ?? 0}
            onUpload={async (filas) => {
              const res = await clienteApi.subirListaFiltrada(filas);
              await cargar();
              return `${res.insertados} cargados${
                res.descartados ? `, ${res.descartados} sin número válido` : ""
              }.`;
            }}
          />
        </div>
      )}

      {tab === "config" && data && (
        <ConfigCard panel={data.panel} onSaved={cargar} />
      )}
    </div>
  );
}
