import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Server-rendered paging for lists that outgrow a screen.
 *
 * These pages used to take a fixed slice — the latest 60 announcements, 200
 * notifications, 100 audit entries — and stop. Not an error, and not visible
 * either: the list simply ended, and everything older than the cap could not be
 * reached from the application at all. A school looking for last term's memo,
 * or an administrator looking for who changed a mark in September, found
 * nothing and had no reason to think anything was missing.
 *
 * Paging lives in the URL rather than in component state so a page of results
 * can be linked, bookmarked and reloaded, and so the work stays on the server:
 * a school with four thousand audit rows never ships them to a browser to
 * paginate them there.
 */

export type Page = { page: number; skip: number; take: number };

/**
 * Reads `?page=` and turns it into a database window.
 *
 * Anything unparseable, negative or absurd becomes page 1 rather than an error.
 * A mistyped URL should show the first page, not a stack trace.
 */
export function pageOf(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  perPage = 25,
): Page {
  const raw = searchParams?.page;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100_000) : 1;

  return { page, skip: (page - 1) * perPage, take: perPage };
}

/** Keeps every other filter in the URL when moving between pages. */
function hrefFor(
  basePath: string,
  searchParams: Record<string, string | string[] | undefined> | undefined,
  page: number,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (key === "page" || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
    else params.set(key, value);
  }

  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * The page numbers worth showing: the ends, the current neighbourhood, and
 * gaps in between. Rendering all of them is unusable past about twenty.
 */
function windowOf(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => pages.add(page));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((page) => pages.add(page));

  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);

  const out: Array<number | "gap"> = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) out.push("gap");
    out.push(page);
    previous = page;
  }
  return out;
}

export function Pager({
  basePath,
  searchParams,
  page,
  perPage,
  total,
  /** What is being counted, for the summary line. Plural. */
  label = "records",
}: {
  basePath: string;
  searchParams?: Record<string, string | string[] | undefined>;
  page: number;
  perPage: number;
  total: number;
  label?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // The count is worth showing even when there is only one page — "23 records"
  // tells a user the list is complete, which is the question paging raises.
  if (totalPages <= 1) {
    return total > 0 ? (
      <p className="mt-3 text-xs text-[var(--text-subtle)]">
        {total.toLocaleString()} {label}
      </p>
    ) : null;
  }

  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  const step = (to: number, disabled: boolean, children: React.ReactNode, title: string) =>
    disabled ? (
      <span
        aria-hidden
        className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--text-subtle)] opacity-40"
      >
        {children}
      </span>
    ) : (
      <Link
        href={hrefFor(basePath, searchParams, to)}
        title={title}
        aria-label={title}
        className="inline-flex size-8 items-center justify-center rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]"
      >
        {children}
      </Link>
    );

  return (
    <nav
      aria-label="Pagination"
      className="mt-3 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-xs text-[var(--text-subtle)]">
        {first.toLocaleString()}-{last.toLocaleString()} of {total.toLocaleString()} {label}
      </p>

      <div className="flex items-center gap-1">
        {step(page - 1, page <= 1, <ChevronLeft className="size-4" />, "Previous page")}

        {windowOf(page, totalPages).map((entry, index) =>
          entry === "gap" ? (
            <span key={`gap-${index}`} className="px-1 text-xs text-[var(--text-subtle)]">
              …
            </span>
          ) : entry === page ? (
            <span
              key={entry}
              aria-current="page"
              className="numeric inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-[var(--primary)] px-2 text-xs font-semibold text-white"
            >
              {entry}
            </span>
          ) : (
            <Link
              key={entry}
              href={hrefFor(basePath, searchParams, entry)}
              className="numeric inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs hover:bg-[var(--bg-subtle)]"
            >
              {entry}
            </Link>
          ),
        )}

        {step(page + 1, page >= totalPages, <ChevronRight className="size-4" />, "Next page")}
      </div>
    </nav>
  );
}
