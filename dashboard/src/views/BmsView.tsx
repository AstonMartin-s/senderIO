import { useState } from "react";
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
} from "../components/icons";
import { estadoBm, estadoMeta, timeAgo, timeUntil } from "../lib/format";

export default function BmsView() {
  const { data, refresh, mutate } = usePolling<Bm[]>(api.bms, 4000);
  const [editing, setEditing] = useState<Bm | "new" | null>(null);
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
        <Button variant="primary" onClick={() => setEditing("new")}>
          <IconPlus className="h-4 w-4" /> Alta de BM
        </Button>
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

              <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="animate-fade-rise relative z-10 max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface ring-1 ring-line shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-6 py-4">
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

        <div className="space-y-6 px-6 py-5">
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

          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-surface px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
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