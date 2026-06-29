import { useEffect, useState } from "react";
import { api, usePolling, type Bm } from "../api";
import { Card, Button, Toggle, ProgressBar, Dot } from "../components/ui";
import {
  IconPause,
  IconPlay,
  IconEdit,
  IconClose,
  IconPlus,
  IconRefresh,
  IconClock,
  IconCheck,
  IconSend,
  IconTrash,
  IconAlert,
} from "../components/icons";
import { estadoBm, estadoMeta, timeAgo, timeUntil } from "../lib/format";

export default function BmsView() {
  const { data, refresh, mutate } = usePolling<Bm[]>(api.bms, 4000);
  const [editing, setEditing] = useState<Bm | "new" | null>(null);
  const [altaAuto, setAltaAuto] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const bms = data ?? [];

  /**
   * Acción optimista: aplica el cambio al instante en la UI, dispara el request,
   * y al volver reemplaza con la verdad del servidor. Si falla, refresca.
   */
  async function act(
    id: string,
    optimistic: Partial<Bm>,
    fn: () => Promise<unknown>
  ) {
    mutate((prev) =>
      (prev ?? []).map((b) => (b.id === id ? { ...b, ...optimistic } : b))
    );
    setBusy((s) => ({ ...s, [id]: true }));
    try {
      const res = await fn();
      if (res && typeof res === "object" && "id" in (res as Bm)) {
        const updated = res as Bm;
        mutate((prev) =>
          (prev ?? []).map((b) => (b.id === id ? updated : b))
        );
      } else {
        refresh();
      }
    } catch {
      refresh(); // revertir al estado real ante error
    } finally {
      setBusy((s) => ({ ...s, [id]: false }));
    }
  }

  async function genBot(bm: Bm) {
    setBusy((s) => ({ ...s, [bm.id]: true }));
    try {
      const r = await api.generarBot(bm.id);
      const json = JSON.stringify(r.bot, null, 2);
      let copiado = false;
      try {
        await navigator.clipboard.writeText(json);
        copiado = true;
      } catch {
        copiado = false;
      }
      // Además del portapapeles, descargamos el JSON como archivo (queda en tu
      // carpeta de Descargas) por si preferís subirlo en vez de pegarlo.
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `salesbot-${bm.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      window.open(r.kommoUrl, "_blank");
      alert(
        `Bot generado.\n` +
          `• Descargado como salesbot-${bm.id}.json (carpeta Descargas)\n` +
          `• ${copiado ? "Copiado al portapapeles" : "No se pudo copiar al portapapeles"}\n\n` +
          `Plantillas en rotación (el lead recibe una por vez, round-robin):\n` +
          (r.plantillasUsadas
            .map((p, i) => `  ${i + 1}. ${p.nombre} → ${p.valorEstampado}`)
            .join("\n") || "  —") +
          (r.descartadas > 0
            ? `\n\n⚠️ ${r.descartadas} plantilla(s) quedaron fuera: el bot rota hasta 4 a la vez.`
            : "") +
          `\n\nEn Kommo (abrí la pestaña): Ajustes → Herramientas de comunicación → ` +
          `Salesbots → Importar un bot, y pegá el JSON.\n` +
          `Cuando termines, tocá "Confirmo bot agregado".`
      );
    } catch (e) {
      alert(`No se pudo generar: ${(e as Error).message}`);
    } finally {
      setBusy((s) => ({ ...s, [bm.id]: false }));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">
            {bms.length} BMs · ajustá ritmo, límites y ventana sin redeploy.
          </p>
          <p className="mt-0.5 text-xs text-faint">
            <span className="font-medium text-muted">activo</span> = encender/apagar el BM ·{" "}
            <span className="font-medium text-muted">Pausar</span> = freno temporal (cortafuegos), se reanuda en el reset diario.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="default" onClick={() => setEditing("new")}>
            <IconPlus className="h-4 w-4" /> Alta manual
          </Button>
          <Button variant="primary" onClick={() => setAltaAuto(true)}>
            <IconPlus className="h-4 w-4" /> Alta automática
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {bms.map((bm) => {
          const est = estadoBm(bm);
          const meta = estadoMeta[est];
          const pct = Number(bm.pctErrorMovil);
          return (
            <Card key={bm.id} className={`p-5 ring-1 ${meta.ring} transition-transform hover:-translate-y-0.5`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <Dot
                    className={`${meta.dot} ${est === "activo" ? "animate-pulse-dot" : ""}`}
                  />
                  <div>
                    <h3 className="font-semibold text-fg">{bm.id}</h3>
                    <p className="text-xs text-faint tabular-nums">
                      pipeline {bm.pipelineId}
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.soft} ${meta.text}`}
                >
                  {meta.label}
                </span>
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-muted">Enviados</span>
                  <span className="tabular-nums font-medium text-fg">
                    {bm.enviadosHoy} / {bm.limiteDiario}
                  </span>
                </div>
                <ProgressBar value={bm.enviadosHoy} max={bm.limiteDiario} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <Metric
                  label="% error móvil"
                  value={`${pct}%`}
                  tone={pct > 15 ? "bad" : pct > 10 ? "warn" : "ok"}
                />
                <Metric
                  label="Racha err."
                  value={`${bm.erroresConsecutivos}/${bm.umbralErroresConsecutivos}`}
                  tone={
                    bm.erroresConsecutivos >= bm.umbralErroresConsecutivos
                      ? "bad"
                      : bm.erroresConsecutivos > 0
                        ? "warn"
                        : "ok"
                  }
                />
                <Metric label="Errores hoy" value={String(bm.erroresHoy)} />
              </div>

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <IconClock className="h-3.5 w-3.5" />
                  ventana {bm.ventanaInicio.slice(0, 5)}–{bm.ventanaFin.slice(0, 5)}
                </span>
                <span>
                  ritmo {bm.intervaloMinSeg}–{bm.intervaloMaxSeg}s
                </span>
                <span>último envío {timeAgo(bm.ultimoEnvio)}</span>
                {bm.activo && !bm.pausado && (
                  <span>próximo {timeUntil(bm.proximoTickAt)}</span>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-line">
                <span className="text-xs font-medium text-muted">Bot</span>
                {bm.botDesactualizado ? (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-300"
                    title="Cambiaste switches de plantillas. Regenerá el bot e importalo en Kommo para que el cambio tenga efecto."
                  >
                    <IconAlert className="h-3.5 w-3.5" /> regenerar bot (cambió la rotación)
                  </span>
                ) : bm.botListo ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-300">
                    <IconCheck className="h-3.5 w-3.5" /> importado en Kommo
                  </span>
                ) : (
                  <span className="text-xs text-faint">no importado</span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant={bm.botDesactualizado ? "primary" : "default"}
                    disabled={busy[bm.id]}
                    onClick={() => genBot(bm)}
                    title="Genera el JSON del Salesbot y abre Kommo para importarlo"
                  >
                    <IconSend className="h-3.5 w-3.5" /> Generar bot
                  </Button>
                  {bm.botListo ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy[bm.id]}
                      onClick={() =>
                        act(bm.id, { botListo: false }, () =>
                          api.patchBm(bm.id, { botListo: false } as Partial<Bm>)
                        )
                      }
                    >
                      Desmarcar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="success"
                      disabled={busy[bm.id]}
                      onClick={() =>
                        act(bm.id, { botListo: true }, () =>
                          api.patchBm(bm.id, { botListo: true } as Partial<Bm>)
                        )
                      }
                    >
                      Confirmo bot agregado
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
                {bm.pausado ? (
                  <Button
                    variant="success"
                    size="sm"
                    disabled={busy[bm.id] || !bm.activo}
                    title={
                      !bm.activo
                        ? "Encendé el BM (switch activo) para reanudarlo"
                        : "Quita el freno temporal y vuelve a enviar"
                    }
                    onClick={() =>
                      act(
                        bm.id,
                        { pausado: false, pausadoHasta: null, erroresConsecutivos: 0 },
                        () => api.resume(bm.id)
                      )
                    }
                  >
                    <IconPlay className="h-3.5 w-3.5" /> Reanudar
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy[bm.id] || !bm.activo}
                    title={
                      !bm.activo
                        ? "El BM está apagado. Pausar es un freno temporal para BMs encendidos."
                        : "Freno temporal: deja de enviar pero sigue encendido. Se reanuda solo en el reset diario."
                    }
                    onClick={() =>
                      act(bm.id, { pausado: true }, () => api.pause(bm.id))
                    }
                  >
                    <IconPause className="h-3.5 w-3.5" /> Pausar
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={busy[bm.id]}
                  onClick={() =>
                    act(
                      bm.id,
                      { enviadosHoy: 0, erroresHoy: 0, erroresConsecutivos: 0 },
                      () => api.resetContadores(bm.id)
                    )
                  }
                >
                  <IconRefresh className="h-3.5 w-3.5" /> Reset
                </Button>
                <div
                  className="ml-auto flex items-center gap-2"
                  title="Switch maestro: enciende o apaga el BM en la operación"
                >
                  <span className="text-xs text-faint">activo</span>
                  <Toggle
                    checked={bm.activo}
                    disabled={busy[bm.id]}
                    onChange={(v) =>
                      act(bm.id, { activo: v }, () => api.patchBm(bm.id, { activo: v }))
                    }
                  />
                  <Button size="sm" variant="ghost" onClick={() => setEditing(bm)}>
                    <IconEdit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy[bm.id]}
                    onClick={async () => {
                      if (
                        !confirm(
                          `¿Eliminar el BM ${bm.id} (${bm.nombre})? Borra su config en ` +
                            `SenderIO; no toca el pipeline en Kommo. No se puede deshacer.`
                        )
                      )
                        return;
                      setBusy((s) => ({ ...s, [bm.id]: true }));
                      try {
                        await api.deleteBm(bm.id);
                        refresh();
                      } catch (e) {
                        alert(`No se pudo eliminar: ${(e as Error).message}`);
                      } finally {
                        setBusy((s) => ({ ...s, [bm.id]: false }));
                      }
                    }}
                    title="Eliminar BM"
                  >
                    <IconTrash className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {editing && (
        <BmModal
          bm={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {altaAuto && (
        <AltaAutoModal
          onClose={() => setAltaAuto(false)}
          onSaved={() => {
            setAltaAuto(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AltaAutoModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ nombre: "", wabaId: "", chatSourceId: "" });
  const [idSug, setIdSug] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.siguienteIdBm().then((r) => setIdSug(r.id)).catch(() => {});
  }, []);

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function crear() {
    setSaving(true);
    setError(null);
    try {
      await api.altaBm({
        nombre: form.nombre,
        wabaId: form.wabaId || null,
        chatSourceId: form.chatSourceId ? Number(form.chatSourceId) : null,
      });
      onSaved();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-fade-rise relative z-10 my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col rounded-2xl bg-surface ring-1 ring-line shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-3">
          <h3 className="text-base font-semibold text-fg">Alta automática de BM</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg">
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <p className="text-xs text-muted">
            Crea el pipeline y sus 5 etapas (BASE/ENVÍO/SI/NO/ERROR) en Kommo y arma el BM
            con esos IDs. La base de origen es la etapa BASE del pipeline nuevo. El ritmo y la
            ventana quedan con valores por defecto, editables después.
            {idSug && (
              <>
                {" "}Se creará como <span className="font-medium text-fg">{idSug}</span>.
              </>
            )}
          </p>
          <Field label="Nombre del BM" value={form.nombre} onChange={(v) => set("nombre", v)} placeholder="DogzeePL" />
          <Field label="WABA id (del número conectado)" value={form.wabaId} onChange={(v) => set("wabaId", v)} placeholder="1019386220453924" />
          <Field label="chat_source id (canal del bot)" value={form.chatSourceId} onChange={(v) => set("chatSourceId", v)} placeholder="59026" />
          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-line px-6 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={crear} disabled={saving || !form.nombre}>
            {saving ? "Creando…" : "Crear BM"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad" | "neutral";
}) {
  const colors = {
    ok: "text-emerald-600 dark:text-emerald-300",
    warn: "text-amber-600 dark:text-amber-300",
    bad: "text-rose-600 dark:text-rose-300",
    neutral: "text-fg",
  };
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2.5 ring-1 ring-line">
      <p className={`text-lg font-bold tabular-nums ${colors[tone]}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-faint">{label}</p>
    </div>
  );
}

function BmModal({
  bm,
  onClose,
  onSaved,
}: {
  bm: Bm | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = bm === null;
  const [form, setForm] = useState<Record<string, string>>({
    id: bm?.id ?? "",
    nombre: bm?.nombre ?? "",
    pipelineId: String(bm?.pipelineId ?? ""),
    stageOrigenId: String(bm?.stageOrigenId ?? ""),
    stageOrigenPipelineId: String(bm?.stageOrigenPipelineId ?? ""),
    stageDestinoId: String(bm?.stageDestinoId ?? ""),
    stageErrorId: String(bm?.stageErrorId ?? ""),
    stageSiId: String(bm?.stageSiId ?? ""),
    stageNoId: String(bm?.stageNoId ?? ""),
    limiteDiario: String(bm?.limiteDiario ?? 30),
    intervaloMinSeg: String(bm?.intervaloMinSeg ?? 120),
    intervaloMaxSeg: String(bm?.intervaloMaxSeg ?? 180),
    ventanaInicio: (bm?.ventanaInicio ?? "17:30").slice(0, 5),
    ventanaFin: (bm?.ventanaFin ?? "23:59").slice(0, 5),
    pausaCortaMin: String(bm?.pausaCortaMin ?? 5),
    pausaCortaMax: String(bm?.pausaCortaMax ?? 10),
    umbralErroresConsecutivos: String(bm?.umbralErroresConsecutivos ?? 5),
    fuenteEnvio: bm?.fuenteEnvio ?? "crm",
    plataforma: bm?.plataforma ?? "",
    campaignId: bm?.campaignId ?? "",
    campaignNombre: bm?.campaignNombre ?? "",
    wabaId: bm?.wabaId ?? "",
    chatSourceId: bm?.chatSourceId != null ? String(bm.chatSourceId) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const num = (v: string) => (v === "" ? null : Number(v));
    const payload: Record<string, unknown> = {
      nombre: form.nombre,
      pipelineId: Number(form.pipelineId),
      stageOrigenId: Number(form.stageOrigenId),
      stageOrigenPipelineId: num(form.stageOrigenPipelineId),
      stageDestinoId: Number(form.stageDestinoId),
      stageErrorId: Number(form.stageErrorId),
      stageSiId: num(form.stageSiId),
      stageNoId: num(form.stageNoId),
      limiteDiario: Number(form.limiteDiario),
      intervaloMinSeg: Number(form.intervaloMinSeg),
      intervaloMaxSeg: Number(form.intervaloMaxSeg),
      ventanaInicio: form.ventanaInicio,
      ventanaFin: form.ventanaFin,
      pausaCortaMin: Number(form.pausaCortaMin),
      pausaCortaMax: Number(form.pausaCortaMax),
      umbralErroresConsecutivos: Number(form.umbralErroresConsecutivos),
      fuenteEnvio: form.fuenteEnvio || "crm",
      plataforma: form.plataforma ? form.plataforma : null,
      campaignId: form.campaignId || null,
      campaignNombre: form.campaignNombre || null,
      wabaId: form.wabaId || null,
      chatSourceId: num(form.chatSourceId),
    };
    try {
      if (isNew) {
        await api.createBm({ id: form.id, ...payload } as never);
      } else {
        await api.patchBm(bm!.id, payload as never);
      }
      onSaved();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="animate-fade-rise relative z-10 my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded-2xl bg-surface ring-1 ring-line shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-3">
          <h3 className="text-base font-semibold text-fg">
            {isNew ? "Alta de BM" : `Editar ${bm!.id}`}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          <Section title="Identidad y mapeo de etapas (Kommo)">
            <div className="grid grid-cols-2 gap-3">
              {isNew && (
                <Field label="ID" value={form.id} onChange={(v) => set("id", v)} placeholder="BM6" />
              )}
              <Field label="Nombre" value={form.nombre} onChange={(v) => set("nombre", v)} />
              <Field label="pipeline_id" value={form.pipelineId} onChange={(v) => set("pipelineId", v)} />
              <Field label="stage_origen" value={form.stageOrigenId} onChange={(v) => set("stageOrigenId", v)} />
              <Field label="pipeline del origen (opcional)" value={form.stageOrigenPipelineId} onChange={(v) => set("stageOrigenPipelineId", v)} placeholder="si la base vive en otro pipeline" />
              <Field label="stage_destino (envío)" value={form.stageDestinoId} onChange={(v) => set("stageDestinoId", v)} />
              <Field label="stage_error" value={form.stageErrorId} onChange={(v) => set("stageErrorId", v)} />
              <Field label="stage_si" value={form.stageSiId} onChange={(v) => set("stageSiId", v)} />
              <Field label="stage_no" value={form.stageNoId} onChange={(v) => set("stageNoId", v)} />
            </div>
          </Section>

          <Section title="Ritmo y límites (aplica en caliente)">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Límite diario" value={form.limiteDiario} onChange={(v) => set("limiteDiario", v)} />
              <Field label="Intervalo mín (s)" value={form.intervaloMinSeg} onChange={(v) => set("intervaloMinSeg", v)} />
              <Field label="Intervalo máx (s)" value={form.intervaloMaxSeg} onChange={(v) => set("intervaloMaxSeg", v)} />
              <Field label="Ventana inicio" value={form.ventanaInicio} onChange={(v) => set("ventanaInicio", v)} type="time" />
              <Field label="Ventana fin" value={form.ventanaFin} onChange={(v) => set("ventanaFin", v)} type="time" />
              <Field label="Umbral racha error" value={form.umbralErroresConsecutivos} onChange={(v) => set("umbralErroresConsecutivos", v)} />
              <Field label="Pausa corta mín (min)" value={form.pausaCortaMin} onChange={(v) => set("pausaCortaMin", v)} />
              <Field label="Pausa corta máx (min)" value={form.pausaCortaMax} onChange={(v) => set("pausaCortaMax", v)} />
            </div>
          </Section>

          <Section title="Trazabilidad (export CSV)">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">
                  Origen de la base
                </span>
                <select
                  value={form.fuenteEnvio}
                  onChange={(e) => set("fuenteEnvio", e.target.value)}
                  className="w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
                >
                  <option value="crm">Interna · crm (es_interno=true)</option>
                  <option value="spam">Externa · spam (es_interno=false)</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">
                  Plataforma
                </span>
                <select
                  value={form.plataforma}
                  onChange={(e) => set("plataforma", e.target.value)}
                  className="w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
                >
                  <option value="">— (default: mooney)</option>
                  <option value="mooney">mooney</option>
                  <option value="pam">pam</option>
                </select>
              </label>
              <Field label="campaign_id_externo" value={form.campaignId} onChange={(v) => set("campaignId", v)} placeholder={`default: ${bm?.id ?? "ID del BM"}`} />
              <Field label="campaign_nombre" value={form.campaignNombre} onChange={(v) => set("campaignNombre", v)} placeholder="default: nombre del BM" />
            </div>
            <p className="mt-2 text-xs text-faint">
              <span className="font-medium text-muted">template_nombre</span> y{" "}
              <span className="font-medium text-muted">mensaje_texto</span> del CSV ya no se
              cargan acá: salen de la plantilla efectivamente enviada (sección Plantillas),
              cruzada por la que estampa el bot en cada lead.
            </p>
          </Section>

          <Section title="Número conectado (Kommo)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="WABA id (waba_selected_waba_ids)" value={form.wabaId} onChange={(v) => set("wabaId", v)} placeholder="1019386220453924" />
              <Field label="chat_source id (canal del bot)" value={form.chatSourceId} onChange={(v) => set("chatSourceId", v)} placeholder="59026" />
            </div>
            <p className="mt-2 text-xs text-faint">
              Se obtienen una sola vez al conectar el número en Kommo. El WABA id se usa al crear plantillas; el chat_source id, al clonar el bot.
            </p>
          </Section>

          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-line px-6 py-3">
          {!isNew && (
            <Button
              variant="danger"
              onClick={async () => {
                if (
                  !confirm(
                    `¿Eliminar el BM ${bm!.id}? Esto borra su configuración en SenderIO ` +
                      `(no toca el pipeline en Kommo). Esta acción no se puede deshacer.`
                  )
                )
                  return;
                setSaving(true);
                try {
                  await api.deleteBm(bm!.id);
                  onSaved();
                } catch (e) {
                  setError(String((e as Error).message));
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              <IconTrash className="h-4 w-4" /> Eliminar BM
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-faint">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition placeholder:text-faint focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
      />
    </label>
  );
}