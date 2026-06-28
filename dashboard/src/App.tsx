import { useState } from "react";
import { api, usePolling } from "./api";
import { Button } from "./components/ui";
import {
  IconGrid,
  IconLayers,
  IconFunnel,
  IconActivity,
  IconRefresh,
  IconSun,
  IconMoon,
  IconMessage,
} from "./components/icons";
import { useTheme } from "./lib/theme";
import Overview from "./views/Overview";
import BmsView from "./views/BmsView";
import FunnelView from "./views/FunnelView";
import LogView from "./views/LogView";
import PlantillasView from "./views/PlantillasView";

type View = "overview" | "bms" | "plantillas" | "funnel" | "log";

const NAV: { id: View; label: string; icon: typeof IconGrid }[] = [
  { id: "overview", label: "Overview", icon: IconGrid },
  { id: "bms", label: "Por BM", icon: IconLayers },
  { id: "plantillas", label: "Plantillas", icon: IconMessage },
  { id: "funnel", label: "Funnel & KPIs", icon: IconFunnel },
  { id: "log", label: "Log en vivo", icon: IconActivity },
];

const TITLES: Record<View, { title: string; sub: string }> = {
  overview: { title: "Overview", sub: "Estado global de la operación de goteo" },
  bms: { title: "Por BM", sub: "Control de ritmo, límites y cortafuegos por número" },
  plantillas: { title: "Plantillas", sub: "Plantillas WABA por BM · rotación con switch ON/OFF" },
  funnel: { title: "Funnel & KPIs", sub: "Embudo de resultados y conversión" },
  log: { title: "Log en vivo", sub: "Movimientos y resultados en tiempo real" },
};

export default function App() {
  const [view, setView] = useState<View>("overview");
  const { theme, toggle } = useTheme();
  const health = usePolling(api.health, 8000);
  const online = !!health.data?.ok;
  const mode = health.data?.kommo ?? "—";

  async function resetDiario() {
    if (!confirm("¿Archivar el día y resetear contadores ahora?")) return;
    await api.resetDiario();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center gap-2.5 px-6 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/30">
            <IconActivity className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-bold tracking-tight text-fg">SenderIO</p>
            <p className="text-[11px] text-faint">Orquestador de goteo</p>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = view === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? "bg-brand-500/12 text-brand-600 dark:text-brand-300"
                    : "text-muted hover:bg-surface-2 hover:text-fg"
                }`}
              >
                <span
                  className={`absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500 transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="m-3 rounded-xl bg-surface-2 p-4 ring-1 ring-line">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                online ? "animate-pulse-dot bg-emerald-400" : "bg-rose-500"
              }`}
            />
            <span className="text-xs font-medium text-muted">
              {online ? "API conectada" : "API sin conexión"}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-faint">
            <span>Modo Kommo</span>
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${
                mode === "real"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-300"
              }`}
            >
              {mode.toUpperCase()}
            </span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-line bg-surface/80 px-8 py-5 backdrop-blur">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-fg">
              {TITLES[view].title}
            </h1>
            <p className="text-sm text-muted">{TITLES[view].sub}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              title={theme === "dark" ? "Cambiar a claro" : "Cambiar a oscuro"}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted ring-1 ring-line-strong transition-all hover:bg-surface-2 hover:text-fg active:scale-95"
            >
              {theme === "dark" ? (
                <IconSun className="h-[18px] w-[18px]" />
              ) : (
                <IconMoon className="h-[18px] w-[18px]" />
              )}
            </button>
            <Button onClick={resetDiario}>
              <IconRefresh className="h-4 w-4" /> Reset diario
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-6">
          <div key={view} className="animate-fade-rise">
            {view === "overview" && <Overview />}
            {view === "bms" && <BmsView />}
            {view === "plantillas" && <PlantillasView />}
            {view === "funnel" && <FunnelView />}
            {view === "log" && <LogView />}
          </div>
        </main>
      </div>
    </div>
  );
}
