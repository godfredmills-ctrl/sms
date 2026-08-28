"use client";

import { cn } from "@/lib/utils";

/**
 * The small square controls at the end of a table row.
 *
 * Written once because there are now three tables with them, and a row control
 * that is 28px in one table and 32px in the next is the kind of difference
 * nobody reports and everybody notices. The label is only read by screen
 * readers and shown on hover: the icons are what people scan, and a row of
 * four labelled buttons would be wider than the record it belongs to.
 */

const BASE =
  "flex size-7 items-center justify-center rounded-md transition-colors " +
  "text-[var(--text-subtle)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] " +
  "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none";

/** Danger, for the control that takes something away. */
const DANGER =
  "hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] " +
  "focus-visible:ring-[var(--danger)]";

export function RowLink({
  href,
  label,
  newTab,
  children,
}: {
  href: string;
  label: string;
  newTab?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      // A plain anchor rather than next/link: several of these open a PDF
      // route, and the client router has nothing useful to do with a file.
      {...(newTab ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className={BASE}
      // The row itself is a link to the record. Without this, clicking a
      // control navigates twice and the second one wins.
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
}

export function RowButton({
  label,
  onClick,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(BASE, tone === "danger" && DANGER)}
    >
      {children}
    </button>
  );
}

/** The container, so the gap between controls is the same in every table. */
export function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-0.5">{children}</div>;
}
