import { useMemo, useState } from "react";
import { api, usePolling, type Bm, type Plantilla, type Boton } from "../api";
import { Card, Button, Toggle } from "../components/ui";
import {
  IconPlus,
  IconClose,
  IconTrash,
  IconCheck,
  IconAlert,
  IconRefresh,
} from "../components/icons";

const ESTADOS: Record<string, { label: string; cls: string }> = {
  local: { label: "Borrador", cls: "bg-line-strong/40 text-muted" },
  borrador: { label: "Borrador", cls: "bg-line-strong/40 text-muted" },
  review: {
    label: "En revisión",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  },
  approved: {
    label: "Aprobada",
    cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  },
  rejected: {
    label: "Rechazada",
    cls: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  },
  paused: {
    label: "Pausada",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  },
};

export default function PlantillasView() {
  const bmsP = usePolling<Bm[]>(api.bms, 8000);
  const plP = usePolling<Plantilla[]>(() => api.plantillas(), 5000);
  const [editing, setEditing] = useState<Plantilla | "new" | null>(null);
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [importando, setImportando] = useState(false);
  const [filtroBm, setFiltroBm] = useState<string>("");

  const bms = bmsP.data ?? [];
  const plantillas = plP.data ?? [];
  const bmNombre = (id: string) =>
    bms.find((b) => b.id === id)?.nombre || id;

  const porBm = useMemo(() => {
    const map = new Map<string, Plantilla[]>();
    for (const p of plantillas) {
      const arr = map.get(p.bmId) ?? [];
      arr.push(p);
      map.set(p.bmId, arr);
    }
    return [...map.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true })
    );
  }, [plantillas]);

  async function toggleActivo(p: Plantilla) {
    setBusy((s) => ({ ...s, [p.id]: true }));
    try {
      await api.patchPlantilla(p.id, { activo: !p.activo });
      plP.refresh();
    } finally {
      setBusy((s) => ({ ...s, [p.id]: false }));
    }
  }

  async function check(p: Plantilla) {
    setBusy((s) => ({ ...s, [p.id]: true }));
    try {
      const r = await api.checkPlantilla(p.id);
      plP.refresh();
      const est = ESTADOS[r.estado]?.label ?? r.estado;
      alert(`Estado actual: ${est}${r.rejectReason ? `\nMotivo: ${r.rejectReason}` : ""}`);
    } catch (e) {
      alert(`No se pudo chequear: ${(e as Error).message}`);
    } finally {
      setBusy((s) => ({ ...s, [p.id]: false }));
    }
  }

  async function borrar(p: Plantilla) {
    if (!confirm(`Borrar la plantilla "${p.nombre}"?`)) return;
    await api.deletePlantilla(p.id);
    plP.refresh();
  }

  async function importar() {
    setImportando(true);
    try {
      const r = await api.importarPlantillas();
      plP.refresh();
      alert(
        `Importación lista.\nImportadas: ${r.importadas}\nYa existían: ${r.salteadas}` +
          (r.sinBm
            ? `\nSin BM (cargá el WABA id en el BM): ${r.sinBm}`
            : "")
      );
    } catch (e) {
      alert(`No se pudo importar: ${(e as Error).message}`);
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="min-w-0 text-sm text-muted">
          {plantillas.length} plantillas · cada una es una rama del bot. Las{" "}
          <span className="font-medium text-muted">activas</span> rotan en el envío;
          las inactivas el bot no las usa.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filtroBm}
            onChange={(e) => setFiltroBm(e.target.value)}
            className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
            title="Filtrar por BM"
          >
            <option value="">Todos los BM</option>
            {porBm.map(([bmId]) => (
              <option key={bmId} value={bmId}>
                {bmNombre(bmId)} ({bmId})
              </option>
            ))}
          </select>
          <Button variant="primary" onClick={importar} disabled={importando}>
            <IconRefresh className="h-4 w-4" />
            {importando ? "Importando…" : "Importar de Kommo"}
          </Button>
          <Button variant="default" onClick={() => setEditing("new")}>
            <IconPlus className="h-4 w-4" /> Registrar manual
          </Button>
        </div>
      </div>

      <Card className="border border-brand-500/20 bg-brand-500/5 p-4">
        <div className="flex items-start gap-3">
          <IconAlert className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" />
          <div className="space-y-1.5 text-sm">
            <p className="font-semibold text-fg">
              Las plantillas WABA se crean y aprueban en Kommo, no acá
            </p>
            <p className="text-muted">
              La API de Kommo no permite asignar el número (WABA) ni mandar a
              aprobación de Meta desde afuera. El flujo es:
            </p>
            <ol className="ml-4 list-decimal space-y-0.5 text-muted">
              <li>
                <span className="font-medium text-fg">En Kommo</span>: Ajustes →
                Plantillas de chat → <span className="font-medium">Nueva plantilla</span>,
                seleccionando la cuenta de WhatsApp del BM. Guardás y esperás la
                aprobación de Meta.
              </li>
              <li>
                <span className="font-medium text-fg">Acá</span>: cuando esté{" "}
                <span className="font-medium">Aprobada</span>, tocás{" "}
                <span className="font-medium">Importar de Kommo</span>. Se asocia
                sola al BM por el WABA id.
              </li>
              <li>
                Prendés el <span className="font-medium">switch ON</span> y ajustás
                el <span className="font-medium">valor estampado</span> para que
                entre en la rotación del bot.
              </li>
            </ol>
            <p className="text-faint">
              “Registrar manual” solo guarda un borrador local (para preparar el
              valor estampado); no crea nada en Kommo.
            </p>
          </div>
        </div>
      </Card>

      {porBm.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted">
          No hay plantillas todavía. Creá la primera en Kommo y después tocá{" "}
          “Importar de Kommo”.
        </Card>
      )}

      {porBm
        .filter(([bmId]) => !filtroBm || bmId === filtroBm)
        .map(([bmId, lista]) => {
        const activas = lista.filter((p) => p.activo).length;
        return (
          <Card key={bmId} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div>
                <span className="text-sm font-semibold text-fg">
                  {bmNombre(bmId)}
                </span>
                <span className="ml-2 text-xs text-faint">{bmId}</span>
              </div>
              <span className="text-xs text-muted">
                {activas} activa{activas === 1 ? "" : "s"} / {lista.length}
              </span>
            </div>
            <div className="divide-y divide-line">
              {lista.map((p) => {
                const est = ESTADOS[p.estado] ?? ESTADOS.local;
                const enKommo = p.kommoTemplateId != null;
                return (
                  <div key={p.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="pt-0.5">
                      <Toggle
                        checked={p.activo}
                        onChange={() => toggleActivo(p)}
                        disabled={busy[p.id]}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-fg">{p.nombre}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${est.cls}`}
                        >
                          {est.label}
                        </span>
                        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-faint ring-1 ring-line">
                          {p.categoria} · {p.idioma}
                        </span>
                        {p.valorEstampado && (
                          <span className="rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[11px] text-brand-600 dark:text-brand-300">
                            estampa: {p.valorEstampado}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-sm text-muted">
                        {p.contenido || <span className="italic text-faint">sin texto</span>}
                      </p>
                      {p.botones.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {p.botones.map((b, i) => (
                            <span
                              key={i}
                              className="rounded-md border border-line-strong px-2 py-0.5 text-[11px] text-muted"
                            >
                              {b.text}
                            </span>
                          ))}
                        </div>
                      )}
                      {p.estado === "rejected" && p.rejectReason && (
                        <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">
                          <IconAlert className="mr-1 inline h-3 w-3" />
                          {p.rejectReason}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {!enKommo ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-300"
                          title="Creala en Kommo (seleccionando la cuenta) y después tocá Importar de Kommo"
                        >
                          <IconAlert className="h-3.5 w-3.5" /> Crear en Kommo
                        </span>
                      ) : p.estado === "approved" ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-300"
                          title={`Kommo template id ${p.kommoTemplateId}`}
                        >
                          <IconCheck className="h-3.5 w-3.5" /> aprobada
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="default"
                          disabled={busy[p.id]}
                          onClick={() => check(p)}
                          title="Chequear estado de aprobación en Kommo/Meta"
                        >
                          <IconRefresh className="h-3.5 w-3.5" /> Chequear estado
                        </Button>
                      )}
                      <button
                        onClick={() => setEditing(p)}
                        className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => borrar(p)}
                        title="Borrar"
                        className="rounded-lg p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300"
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {editing && (
        <PlantillaModal
          plantilla={editing === "new" ? null : editing}
          bms={bms}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            plP.refresh();
          }}
        />
      )}
    </div>
  );
}

function PlantillaModal({
  plantilla,
  bms,
  onClose,
  onSaved,
}: {
  plantilla: Plantilla | null;
  bms: Bm[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = plantilla === null;
  const editableEnKommo = plantilla?.kommoTemplateId != null;
  const bmInicial = plantilla?.bmId ?? bms[0]?.id ?? "";
  const wabaDelBm = (id: string) => bms.find((b) => b.id === id)?.wabaId ?? "";
  const [form, setForm] = useState({
    bmId: bmInicial,
    nombre: plantilla?.nombre ?? "",
    categoria: plantilla?.categoria ?? "MARKETING",
    idioma: plantilla?.idioma ?? "es",
    contenido: plantilla?.contenido ?? "",
    header: plantilla?.header ?? "",
    footer: plantilla?.footer ?? "",
    valorEstampado: plantilla?.valorEstampado ?? "",
    estado: plantilla?.estado ?? "review",
    // Precarga: si es nueva, hereda el WABA id del BM elegido.
    wabaId: plantilla?.wabaId ?? wabaDelBm(bmInicial),
  });
  const [botones, setBotones] = useState<Boton[]>(plantilla?.botones ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Al cambiar de BM en el alta, hereda el WABA id de ese BM (si la plantilla
  // todavía no tenía uno propio escrito a mano).
  function cambiarBm(id: string) {
    setForm((f) => ({
      ...f,
      bmId: id,
      wabaId: f.wabaId && f.wabaId !== wabaDelBm(f.bmId) ? f.wabaId : wabaDelBm(id),
    }));
  }

  const bmSel = bms.find((b) => b.id === form.bmId);

  async function save() {
    setSaving(true);
    setError(null);
    const payload: Partial<Plantilla> = {
      nombre: form.nombre,
      categoria: form.categoria,
      idioma: form.idioma,
      contenido: form.contenido,
      header: form.header || null,
      footer: form.footer || null,
      valorEstampado: form.valorEstampado || null,
      estado: form.estado,
      wabaId: form.wabaId || null,
      botones: botones.filter((b) => b.text.trim()),
    };
    try {
      if (isNew) {
        await api.createPlantilla({ bmId: form.bmId, ...payload });
      } else {
        await api.patchPlantilla(plantilla!.id, payload);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-fade-rise relative z-10 my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col rounded-2xl bg-surface ring-1 ring-line shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <h3 className="text-base font-semibold text-fg">
            {isNew ? "Registrar plantilla (local)" : `Editar ${plantilla!.nombre}`}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg">
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {isNew && (
            <p className="rounded-lg bg-brand-500/10 px-3 py-2 text-xs text-brand-700 dark:text-brand-300">
              Esto guarda un <span className="font-medium">borrador local</span> en
              SenderIO (no crea nada en Kommo). La plantilla real se crea y aprueba en
              Kommo y después se trae con “Importar de Kommo”. Sirve para dejar listo
              el valor estampado de antemano.
            </p>
          )}
          {editableEnKommo && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Esta plantilla ya fue creada en Kommo. Editar acá NO actualiza la copia en
              Kommo/Meta (esa requiere re-crearla).
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">BM</span>
              <select
                value={form.bmId}
                disabled={!isNew}
                onChange={(e) => cambiarBm(e.target.value)}
                className="w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60"
              >
                {bms.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre || b.id} ({b.id})
                  </option>
                ))}
              </select>
            </label>
            <ModalField label="Nombre" value={form.nombre} onChange={(v) => set("nombre", v)} placeholder="welcomeback_dogzee" />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Categoría</span>
              <select
                value={form.categoria}
                onChange={(e) => set("categoria", e.target.value)}
                className="w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="MARKETING">MARKETING</option>
                <option value="UTILITY">UTILITY</option>
                <option value="AUTHENTICATION">AUTHENTICATION</option>
              </select>
            </label>
            <ModalField label="Idioma" value={form.idioma} onChange={(v) => set("idioma", v)} placeholder="es" />
            <ModalField label="Valor estampado (PLANTILLA_ENVIADA)" value={form.valorEstampado} onChange={(v) => set("valorEstampado", v)} placeholder="dogzee_a" />
            <ModalField label="WABA id (heredado del BM)" value={form.wabaId} onChange={(v) => set("wabaId", v)} placeholder={bmSel?.wabaId ?? "se toma del BM"} />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">
                Estado de moderación (lo marcás vos)
              </span>
              <select
                value={form.estado}
                onChange={(e) => set("estado", e.target.value)}
                className="w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="borrador">Borrador</option>
                <option value="review">En revisión</option>
                <option value="approved">Aprobada</option>
                <option value="rejected">Rechazada</option>
                <option value="paused">Pausada</option>
              </select>
            </label>
          </div>
          <p className="-mt-1 text-xs text-faint">
            Kommo no informa el estado de aprobación por API. Marcá acá lo que ves en
            Kommo/Meta. Solo las <span className="font-medium">Aprobadas</span> en ON
            entran al bot al generarlo.
          </p>
          {bmSel && (
            <p className="-mt-1 text-xs text-faint">
              Datos del BM <span className="font-medium text-muted">{bmSel.nombre || bmSel.id}</span>:
              {" "}WABA {bmSel.wabaId ?? "—"} · chat_source {bmSel.chatSourceId ?? "—"}.
              {!bmSel.wabaId && (
                <span className="text-amber-600 dark:text-amber-300">
                  {" "}Cargá el WABA id en el BM para no escribirlo a mano.
                </span>
              )}
            </p>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Contenido (cuerpo)</span>
            <textarea
              value={form.contenido}
              onChange={(e) => set("contenido", e.target.value)}
              rows={5}
              placeholder="Hola! Te escribimos de…"
              className="w-full resize-y rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <ModalField label="Header (opcional)" value={form.header} onChange={(v) => set("header", v)} />
            <ModalField label="Footer (opcional)" value={form.footer} onChange={(v) => set("footer", v)} />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">Botones</span>
              <button
                onClick={() => setBotones((b) => [...b, { text: "", type: "inline" }])}
                className="text-xs text-brand-600 hover:underline dark:text-brand-300"
              >
                + Agregar botón
              </button>
            </div>
            <div className="space-y-2">
              {botones.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={b.text}
                    placeholder="Texto del botón"
                    onChange={(e) =>
                      setBotones((arr) =>
                        arr.map((x, j) => (j === i ? { ...x, text: e.target.value } : x))
                      )
                    }
                    className="flex-1 rounded-lg border border-line-strong bg-surface-2 px-3 py-1.5 text-sm text-fg outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
                  />
                  <button
                    onClick={() => setBotones((arr) => arr.filter((_, j) => j !== i))}
                    className="rounded-lg p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {botones.length === 0 && (
                <p className="text-xs text-faint">Sin botones.</p>
              )}
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={saving || !form.nombre || !form.bmId}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModalField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition placeholder:text-faint focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
      />
    </label>
  );
}
