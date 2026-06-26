import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-surface ring-1 ring-line shadow-[var(--ring-shadow)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  size = "md",
  type = "button",
  disabled,
  title,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "ghost" | "danger" | "success";
  size?: "sm" | "md";
  type?: "button" | "submit";
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface";
  const sizes = { sm: "text-xs px-2.5 py-1.5", md: "text-sm px-3.5 py-2" };
  const variants = {
    default:
      "bg-surface text-fg ring-1 ring-line-strong hover:bg-surface-2",
    primary:
      "bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-500/30",
    ghost: "text-muted hover:bg-surface-2 hover:text-fg",
    danger:
      "bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20 hover:bg-rose-500/20 dark:text-rose-300",
    success:
      "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 dark:text-emerald-300",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="group relative overflow-hidden p-5 transition-shadow hover:shadow-[0_0_0_1px_var(--color-brand-500)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-faint">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-fg tabular-nums">
            {value}
          </p>
          {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
        </div>
        {icon && (
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              accent ?? "bg-brand-500/12 text-brand-500 dark:text-brand-300"
            }`}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

export function Dot({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${className}`} />;
}

export function ProgressBar({
  value,
  max,
  className = "bg-brand-500",
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
      <div
        className={`h-full rounded-full transition-all duration-500 ${className}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-60 disabled:cursor-not-allowed ${
        checked ? "bg-brand-500" : "bg-line-strong"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
