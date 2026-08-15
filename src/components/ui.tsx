import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Presentational primitives.
 *
 * Deliberately hook-free so the same components can be rendered from server
 * components (most pages) and from client components (forms, tables) without
 * duplicating a parallel set.
 */

// -----------------------------------------------------------------------------
// Button
// -----------------------------------------------------------------------------

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "outline"
  | "subtle";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-text)] hover:bg-[var(--primary-hover)] shadow-sm",
  secondary:
    "bg-[var(--bg-subtle)] text-[var(--text)] hover:bg-[var(--border)] border border-[var(--border)]",
  outline:
    "bg-transparent text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]",
  ghost: "bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
  subtle:
    "bg-[var(--primary-soft)] text-[var(--primary)] hover:brightness-95 border border-transparent",
  danger: "bg-[var(--danger)] text-white hover:brightness-110 shadow-sm",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9.5 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-sm gap-2",
  icon: "h-9 w-9 p-0",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap",
        "transition-colors disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Anchor styled as a button, for navigation actions. */
export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<"a"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <a
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap",
        "transition-colors",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}

// -----------------------------------------------------------------------------
// Surfaces
// -----------------------------------------------------------------------------

export function Card({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div className={cn("card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("p-5", className)} {...props}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumb?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb ? (
          <div className="mb-1.5 text-xs text-[var(--text-subtle)]">{breadcrumb}</div>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Form fields
// -----------------------------------------------------------------------------

export function Label({ className, children, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("mb-1.5 block text-xs font-medium text-[var(--text-muted)]", className)}
      {...props}
    >
      {children}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-[var(--danger)]">*</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-[var(--text-subtle)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn("input-base", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={cn("input-base min-h-24 resize-y", className)} {...props} />
  );
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn("input-base pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-4 shrink-0 rounded border-[var(--border-strong)] accent-[var(--primary)]",
        className,
      )}
      {...props}
    />
  );
}

export function CheckboxField({
  label,
  description,
  className,
  ...props
}: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--border)] p-3 transition-colors hover:bg-[var(--bg-subtle)]",
        className,
      )}
    >
      <Checkbox className="mt-0.5" {...props} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--text)]">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

// -----------------------------------------------------------------------------
// Badges & status
// -----------------------------------------------------------------------------

export type Tone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "violet"
  | "teal";

const TONE_STYLES: Record<Tone, string> = {
  neutral: "bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border)]",
  primary: "bg-[var(--primary-soft)] text-[var(--primary)] border-transparent",
  success: "bg-[var(--success-soft)] text-[var(--success)] border-transparent",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)] border-transparent",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-transparent",
  info: "bg-[var(--info-soft)] text-[var(--info)] border-transparent",
  violet: "bg-[var(--violet-soft)] text-[var(--violet)] border-transparent",
  teal: "bg-[var(--teal-soft)] text-[var(--teal)] border-transparent",
};

/** The solid colour a tone contributes to accents and icon tiles. */
const TONE_ACCENT: Record<Tone, string> = {
  neutral: "var(--text-subtle)",
  primary: "var(--primary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  violet: "var(--violet)",
  teal: "var(--teal)",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONE_STYLES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Maps the domain status strings to a consistent colour language. */
export function statusTone(status: string): Tone {
  const value = status.toUpperCase();
  if (
    [
      "ACTIVE",
      "ENROLLED",
      "PAID",
      "SUCCESS",
      "PUBLISHED",
      "APPROVED",
      "PRESENT",
      "COMPLETED",
      "DELIVERED",
      "OPEN",
      "SENT",
    ].includes(value)
  ) {
    return "success";
  }
  if (
    ["PART_PAID", "PENDING", "PROCESSING", "QUEUED", "DRAFT", "LATE", "ON_LEAVE", "PROBATION", "SCHEDULED", "PENDING_APPROVAL", "PENDING_REVIEW"].includes(
      value,
    )
  ) {
    return "warning";
  }
  if (
    ["OVERDUE", "FAILED", "ABSENT", "SUSPENDED", "CANCELLED", "REJECTED", "DISABLED", "BOUNCED", "DISQUALIFIED", "WRITTEN_OFF", "TERMINATED"].includes(
      value,
    )
  ) {
    return "danger";
  }
  if (["ISSUED", "INVITED", "EXCUSED", "NOMINATED", "SENDING", "RUNNING"].includes(value)) {
    return "info";
  }
  return "neutral";
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={statusTone(status)}>
      {status
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())}
    </Badge>
  );
}

export function Avatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] font-semibold text-[var(--primary)]",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {letters || "?"}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Feedback
// -----------------------------------------------------------------------------

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        TONE_STYLES[tone],
        className,
      )}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(Boolean(title) && "mt-1")}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-subtle)]">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-[var(--text)]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function ProgressBar({
  value,
  tone = "primary",
  className,
  label,
}: {
  value: number;
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const colour =
    tone === "success"
      ? "var(--success)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "danger"
          ? "var(--danger)"
          : tone === "info"
            ? "var(--info)"
            : "var(--primary)";

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${clamped}%`, background: colour }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Stats
// -----------------------------------------------------------------------------

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  trend,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  trend?: { value: number; label?: string };
  href?: string;
}) {
  const content = (
    <div className="relative z-10">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
          {label}
        </p>
        {icon ? (
          <span className="kpi-icon flex size-9 shrink-0 items-center justify-center rounded-lg shadow-sm">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="numeric mt-2 text-2xl font-semibold tracking-tight text-[var(--text)]">
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {trend ? (
          <span
            className={cn(
              "numeric font-medium",
              trend.value >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]",
            )}
          >
            {trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value).toFixed(1)}%
          </span>
        ) : null}
        {hint ? <span className="text-[var(--text-subtle)]">{hint}</span> : null}
      </div>
    </div>
  );

  // The tone drives the accent bar, the icon tile and the wash via one variable.
  const style = { "--kpi-accent": TONE_ACCENT[tone] } as React.CSSProperties;

  return href ? (
    <a href={href} className="kpi block p-4" style={style}>
      {content}
    </a>
  ) : (
    <div className="kpi p-4" style={style}>
      {content}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Layout helpers
// -----------------------------------------------------------------------------

export function DescriptionList({
  items,
  columns = 2,
  className,
}: {
  items: Array<{ label: ReactNode; value: ReactNode; span?: boolean }>;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 1
          ? "grid-cols-1"
          : columns === 3
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-1 sm:grid-cols-2",
        className,
      )}
    >
      {items.map((item, index) => (
        <div key={index} className={cn("min-w-0", item.span && "sm:col-span-full")}>
          <dt className="text-xs font-medium tracking-wide text-[var(--text-subtle)] uppercase">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-sm break-words text-[var(--text)]">
            {item.value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-t border-[var(--border)]", className)} />;
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h3 className="text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
        {children}
      </h3>
      {action}
    </div>
  );
}
