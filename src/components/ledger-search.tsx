import { Search } from "lucide-react";

import { Input } from "@/components/ui";

/**
 * A search box that searches the database rather than the browser.
 *
 * The tables on the money and audit pages are server-paginated: fifty rows go
 * to the browser and a Pager beneath reports the true total. DataTable's own
 * search box works over the rows it was handed, so on those pages it could
 * only ever find what was already on screen — and a bursar hunting a parent's
 * bill got "no invoices match" while the invoices sat on page twelve.
 *
 * This one submits, so the query reaches Prisma. Plain GET, no client
 * component: the browser's own form submission is the whole mechanism, which
 * also means it works before hydration and keeps the query in the URL where
 * it can be shared and bookmarked.
 */
export function LedgerSearch({
  action,
  defaultValue,
  placeholder,
  label,
  found,
  noun,
  hidden,
}: {
  /** The page's own path — the form posts back to it. */
  action: string;
  defaultValue: string;
  placeholder: string;
  label: string;
  /** Total matching rows, from the server's count. */
  found: number;
  /** Singular noun for the result line, e.g. "invoice". */
  noun: string;
  /**
   * Other query parameters the page is currently filtered by.
   *
   * A GET form submits only its own fields, so anything already in the URL —
   * a category, a tab — is dropped the moment someone searches. Carried as
   * hidden inputs, the two controls compose instead of cancelling.
   */
  hidden?: Record<string, string>;
}) {
  return (
    <form method="get" action={action} className="mb-3">
      {Object.entries(hidden ?? {}).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
          <Input
            name="q"
            defaultValue={defaultValue}
            placeholder={placeholder}
            aria-label={label}
            className="pl-8"
          />
        </div>
        <button
          type="submit"
          className="h-9 shrink-0 rounded-[var(--radius)] bg-[var(--primary)] px-4 text-sm font-medium text-white"
        >
          Search
        </button>
        {defaultValue ? (
          <a
            href={action}
            className="shrink-0 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Clear
          </a>
        ) : null}
      </div>
      {defaultValue ? (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          <span className="numeric">{found}</span> {noun}
          {found === 1 ? "" : "s"} match &ldquo;{defaultValue}&rdquo; across the whole
          record.
        </p>
      ) : null}
    </form>
  );
}
