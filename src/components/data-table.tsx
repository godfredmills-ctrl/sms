"use client";

import { Fragment, useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownUp,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Filter,
  Search,
  Rows3,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge, Button, Checkbox, EmptyState, type Tone } from "@/components/ui";

/**
 * Advanced data table.
 *
 * Built for the reality of school administration: long lists, lots of columns,
 * and staff who work from a phone as often as a desktop. Columns carry a
 * `priority`; anything the viewport cannot fit is not dropped but moved into a
 * per-row reveal panel, so no data is ever silently hidden.
 */

export type ColumnFilter = {
  /** `select` gives one-of; `tags` gives multi-select chips. */
  type: "select" | "tags";
  label?: string;
  /** Omit to derive the options from the data. */
  options?: Array<{ value: string; label: string; tone?: Tone }>;
};

export type Column<T> = {
  id: string;
  header: string;
  /** Raw value used for sorting, searching, filtering and export. */
  accessor?: (row: T) => string | number | null | undefined;
  /** Rendered cell. Falls back to the accessor value. */
  cell?: (row: T) => ReactNode;
  sortable?: boolean;
  filter?: ColumnFilter;
  /** 1 = always shown, 2 = hidden below md, 3 = hidden below xl. */
  priority?: 1 | 2 | 3;
  align?: "left" | "center" | "right";
  width?: string;
  className?: string;
  /** Exclude from the global search index (e.g. an actions column). */
  searchable?: boolean;
};

export type DataTableProps<T> = {
  rows: T[];
  columns: Array<Column<T>>;
  rowKey: (row: T) => string;
  /** Row click navigates here. */
  href?: (row: T) => string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
  /**
   * These rows are one server-fetched page of a larger set, not the whole
   * table.
   *
   * It matters because everything this component does — search, filter, sort,
   * export — happens in the browser over `rows`. Handed 50 of a school's
   * 3,200 invoices, the search box answered "no invoices match" for a parent
   * who had three, and the pager underneath went on reporting 3,200. Two
   * paginators, one of them lying.
   *
   * Set this and the component stops pretending: its own pagination goes
   * (the page's Pager is the real one), and the search box says what it
   * actually searches.
   */
  partial?: boolean;
  toolbar?: ReactNode;
  /** Enables checkboxes and renders the bulk bar when rows are selected. */
  bulkActions?: (selected: T[], clear: () => void) => ReactNode;
  exportFileName?: string;
  /** Persisted per-table so a user's column choices survive navigation. */
  storageKey?: string;
  initialSort?: { columnId: string; direction: "asc" | "desc" };
};

type SortState = { columnId: string; direction: "asc" | "desc" } | null;

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  href,
  searchPlaceholder = "Search…",
  emptyTitle = "Nothing to show",
  emptyDescription = "Try adjusting your search or filters.",
  pageSize: initialPageSize = 25,
  partial = false,
  toolbar,
  bulkActions,
  exportFileName,
  storageKey,
  initialSort = undefined,
}: DataTableProps<T>) {
  const instanceId = useId();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<SortState>(initialSort ?? null);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  // One page in, one page out: the outer Pager moves between server pages.
  const effectivePageSize = partial ? Math.max(rows.length, 1) : pageSize;
  const [hidden, setHidden] = useState<string[]>([]);
  const [dense, setDense] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);

  // Restore the user's column and density preferences.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = window.localStorage.getItem(`dt:${storageKey}`);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { hidden?: string[]; dense?: boolean };
      if (parsed.hidden) setHidden(parsed.hidden);
      if (typeof parsed.dense === "boolean") setDense(parsed.dense);
    } catch {
      // A corrupt preference should never break the table.
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    window.localStorage.setItem(`dt:${storageKey}`, JSON.stringify({ hidden, dense }));
  }, [storageKey, hidden, dense]);

  const valueOf = useMemo(
    () => (row: T, column: Column<T>) => column.accessor?.(row) ?? "",
    [],
  );

  // --- Filter option derivation --------------------------------------------
  const filterColumns = useMemo(
    () => columns.filter((column) => column.filter),
    [columns],
  );

  const filterOptions = useMemo(() => {
    const map: Record<string, Array<{ value: string; label: string; tone?: Tone }>> = {};
    for (const column of filterColumns) {
      if (column.filter?.options) {
        map[column.id] = column.filter.options;
        continue;
      }
      const seen = new Set<string>();
      for (const row of rows) {
        const raw = valueOf(row, column);
        if (raw === null || raw === undefined || raw === "") continue;
        seen.add(String(raw));
      }
      map[column.id] = Array.from(seen)
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: humanise(value) }));
    }
    return map;
  }, [filterColumns, rows, valueOf]);

  // --- Search / filter / sort ----------------------------------------------
  const processed = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const searchColumns = columns.filter(
      (column) => column.accessor && column.searchable !== false,
    );

    let result = rows.filter((row) => {
      if (needle) {
        const haystack = searchColumns
          .map((column) => String(valueOf(row, column) ?? ""))
          .join(" ")
          .toLowerCase();
        // Every term must appear somewhere in the row — lets staff type
        // "jhs 2 boarder" and narrow progressively.
        if (!needle.split(/\s+/).every((term) => haystack.includes(term))) return false;
      }

      for (const [columnId, values] of Object.entries(filters)) {
        if (!values.length) continue;
        const column = columns.find((candidate) => candidate.id === columnId);
        if (!column) continue;
        const cellValue = String(valueOf(row, column) ?? "");
        if (!values.includes(cellValue)) return false;
      }

      return true;
    });

    if (sort) {
      const column = columns.find((candidate) => candidate.id === sort.columnId);
      if (column?.accessor) {
        const direction = sort.direction === "asc" ? 1 : -1;
        result = [...result].sort((a, b) => {
          const left = column.accessor?.(a);
          const right = column.accessor?.(b);
          if (left === right) return 0;
          // Blanks always sort last, regardless of direction.
          if (left === null || left === undefined || left === "") return 1;
          if (right === null || right === undefined || right === "") return -1;
          if (typeof left === "number" && typeof right === "number") {
            return (left - right) * direction;
          }
          return String(left).localeCompare(String(right), undefined, {
            numeric: true,
            sensitivity: "base",
          }) * direction;
        });
      }
    }

    return result;
  }, [rows, columns, deferredQuery, filters, sort, valueOf]);

  const pageCount = Math.max(1, Math.ceil(processed.length / effectivePageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () =>
      processed.slice(
        currentPage * effectivePageSize,
        currentPage * effectivePageSize + effectivePageSize,
      ),
    [processed, currentPage, effectivePageSize],
  );

  // Reset to the first page whenever the result set changes shape.
  useEffect(() => {
    setPage(0);
  }, [deferredQuery, filters, pageSize]);

  const visibleColumns = columns.filter((column) => !hidden.includes(column.id));
  const activeFilterCount = Object.values(filters).flat().length;
  const selectedRows = processed.filter((row) => selected.includes(rowKey(row)));

  function toggleSort(column: Column<T>) {
    if (column.sortable === false || !column.accessor) return;
    setSort((current) => {
      if (current?.columnId !== column.id) return { columnId: column.id, direction: "asc" };
      if (current.direction === "asc") return { columnId: column.id, direction: "desc" };
      return null;
    });
  }

  function toggleFilter(columnId: string, value: string, multi: boolean) {
    setFilters((current) => {
      const existing = current[columnId] ?? [];
      if (!multi) {
        return { ...current, [columnId]: existing.includes(value) ? [] : [value] };
      }
      return {
        ...current,
        [columnId]: existing.includes(value)
          ? existing.filter((entry) => entry !== value)
          : [...existing, value],
      };
    });
  }

  function exportCsv() {
    const exportable = visibleColumns.filter((column) => column.accessor);
    const header = exportable.map((column) => column.header);
    const lines = processed.map((row) =>
      exportable.map((column) => csvCell(valueOf(row, column))),
    );
    const csv = [header.map(csvCell), ...lines].map((line) => line.join(",")).join("\r\n");
    // The BOM makes Excel open UTF-8 correctly, which matters for names.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${exportFileName ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card overflow-hidden">
      {/* ---------------------------------------------------------------- */}
      {/* Toolbar                                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--text-subtle)]"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={partial ? "Search this page…" : searchPlaceholder}
            aria-label={partial ? "Search the rows on this page" : searchPlaceholder}
            className="input-base h-9 pl-9"
          />
        </div>

        {filterColumns.length > 0 ? (
          <Button
            variant={showFilters || activeFilterCount ? "subtle" : "outline"}
            size="sm"
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
          >
            <Filter className="size-3.5" />
            Filters
            {activeFilterCount ? (
              <span className="ml-0.5 rounded-full bg-[var(--primary)] px-1.5 text-[10px] text-[var(--primary-text)]">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        ) : null}

        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowColumns((value) => !value)}
            aria-expanded={showColumns}
          >
            <Columns3 className="size-3.5" />
            <span className="hidden sm:inline">Columns</span>
          </Button>
          {showColumns ? (
            <>
              <button
                type="button"
                aria-label="Close column menu"
                className="fixed inset-0 z-20 cursor-default"
                onClick={() => setShowColumns(false)}
              />
              <div className="card absolute right-0 z-30 mt-1 w-56 p-2 shadow-lg">
                <p className="px-2 py-1 text-[11px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                  Visible columns
                </p>
                <div className="max-h-72 overflow-y-auto">
                  {columns.map((column) => (
                    <label
                      key={column.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--bg-subtle)]"
                    >
                      <Checkbox
                        checked={!hidden.includes(column.id)}
                        onChange={() =>
                          setHidden((current) =>
                            current.includes(column.id)
                              ? current.filter((id) => id !== column.id)
                              : [...current, column.id],
                          )
                        }
                      />
                      {column.header}
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setDense((value) => !value)}
          title={dense ? "Comfortable rows" : "Compact rows"}
          aria-label={dense ? "Comfortable rows" : "Compact rows"}
        >
          <Rows3 className="size-3.5" />
        </Button>

        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="size-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>

        {toolbar}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Filter chips                                                      */}
      {/* ---------------------------------------------------------------- */}
      {showFilters && filterColumns.length > 0 ? (
        <div className="space-y-3 border-b border-[var(--border)] bg-[var(--bg-inset)] p-3">
          {filterColumns.map((column) => {
            const options = filterOptions[column.id] ?? [];
            if (!options.length) return null;
            const active = filters[column.id] ?? [];
            const multi = column.filter?.type === "tags";

            return (
              <div key={column.id}>
                <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                  {column.filter?.label ?? column.header}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {options.map((option) => {
                    const isActive = active.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleFilter(column.id, option.value, multi)}
                        aria-pressed={isActive}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          isActive
                            ? "border-transparent bg-[var(--primary)] text-[var(--primary-text)]"
                            : "border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {activeFilterCount ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
              <X className="size-3.5" />
              Clear all filters
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Bulk actions                                                      */}
      {/* ---------------------------------------------------------------- */}
      {bulkActions && selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--primary-soft)] px-4 py-2.5">
          <span className="text-sm font-medium text-[var(--primary)]">
            {selected.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions(selectedRows, () => setSelected([]))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setSelected([])}
          >
            Clear
          </Button>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Table                                                             */}
      {/* ---------------------------------------------------------------- */}
      {pageRows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="sticky-head border-b border-[var(--border)]">
                {bulkActions ? (
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <Checkbox
                      aria-label="Select all rows on this page"
                      checked={
                        pageRows.length > 0 &&
                        pageRows.every((row) => selected.includes(rowKey(row)))
                      }
                      onChange={(event) => {
                        const keys = pageRows.map(rowKey);
                        setSelected((current) =>
                          event.target.checked
                            ? Array.from(new Set([...current, ...keys]))
                            : current.filter((key) => !keys.includes(key)),
                        );
                      }}
                    />
                  </th>
                ) : null}

                {visibleColumns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    style={{ width: column.width }}
                    className={cn(
                      "px-3 py-2.5 text-left text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                      priorityClass(column.priority),
                    )}
                  >
                    {column.sortable !== false && column.accessor ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex items-center gap-1 hover:text-[var(--text)]"
                      >
                        {column.header}
                        {sort?.columnId === column.id ? (
                          sort.direction === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ArrowDownUp className="size-3 opacity-30" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}

                {/* Reveal toggle for columns the viewport cannot fit. */}
                <th scope="col" className="w-10 px-2 xl:hidden">
                  <span className="sr-only">Show more</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {pageRows.map((row) => {
                const key = rowKey(row);
                const isExpanded = expanded === key;
                const hiddenOnThisViewport = visibleColumns.filter(
                  (column) => (column.priority ?? 1) > 1,
                );

                return (
                  <Fragment key={key}>
                    <tr
                      className={cn(
                        "border-b border-[var(--border)] transition-colors last:border-0",
                        "hover:bg-[var(--bg-subtle)]",
                        selected.includes(key) && "bg-[var(--primary-soft)]",
                      )}
                    >
                      {bulkActions ? (
                        <td className="px-3">
                          <Checkbox
                            aria-label="Select row"
                            checked={selected.includes(key)}
                            onChange={(event) =>
                              setSelected((current) =>
                                event.target.checked
                                  ? [...current, key]
                                  : current.filter((entry) => entry !== key),
                              )
                            }
                          />
                        </td>
                      ) : null}

                      {visibleColumns.map((column, columnIndex) => {
                        const content = column.cell
                          ? column.cell(row)
                          : formatValue(valueOf(row, column));

                        return (
                          <td
                            key={column.id}
                            className={cn(
                              dense ? "px-3 py-1.5" : "px-3 py-2.5",
                              "text-[var(--text)]",
                              column.align === "right" && "numeric text-right",
                              column.align === "center" && "text-center",
                              priorityClass(column.priority),
                              column.className,
                            )}
                          >
                            {href && columnIndex === 0 ? (
                              <a
                                href={href(row)}
                                className="font-medium hover:text-[var(--primary)] hover:underline"
                              >
                                {content}
                              </a>
                            ) : (
                              content
                            )}
                          </td>
                        );
                      })}

                      <td className="px-2 xl:hidden">
                        {hiddenOnThisViewport.length ? (
                          <button
                            type="button"
                            onClick={() => setExpanded(isExpanded ? null : key)}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? "Hide details" : "Show details"}
                            className="flex size-7 items-center justify-center rounded-md text-[var(--text-subtle)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
                          >
                            <ChevronDown
                              className={cn(
                                "size-4 transition-transform",
                                isExpanded && "rotate-180",
                              )}
                            />
                          </button>
                        ) : null}
                      </td>
                    </tr>

                    {/* Reveal panel: everything the viewport had to drop. */}
                    {isExpanded ? (
                      <tr className="xl:hidden">
                        <td
                          colSpan={visibleColumns.length + (bulkActions ? 2 : 1)}
                          className="border-b border-[var(--border)] bg-[var(--bg-inset)] px-4 py-3"
                        >
                          <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                            {visibleColumns
                              .filter((column) => (column.priority ?? 1) > 1)
                              .map((column) => (
                                <div
                                  key={column.id}
                                  className={cn(
                                    "flex items-baseline justify-between gap-3",
                                    column.priority === 2 && "md:hidden",
                                  )}
                                >
                                  <dt className="text-xs text-[var(--text-subtle)]">
                                    {column.header}
                                  </dt>
                                  <dd className="text-right text-sm text-[var(--text)]">
                                    {column.cell
                                      ? column.cell(row)
                                      : formatValue(valueOf(row, column))}
                                  </dd>
                                </div>
                              ))}
                          </dl>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Pagination                                                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-3">
          <span className="numeric">
            {partial
              ? processed.length === rows.length
                ? `${rows.length} on this page`
                : `${processed.length} of ${rows.length} on this page`
              : processed.length === 0
                ? "No results"
                : `${currentPage * pageSize + 1}-${Math.min(
                    (currentPage + 1) * pageSize,
                    processed.length,
                  )} of ${processed.length}`}
            {!partial && processed.length !== rows.length ? (
              <span className="text-[var(--text-subtle)]"> (filtered from {rows.length})</span>
            ) : null}
          </span>
          <label className={partial ? "hidden" : "flex items-center gap-1.5"}>
            <span className="sr-only">Rows per page</span>
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="rounded border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-xs"
              aria-label="Rows per page"
              id={`${instanceId}-page-size`}
            >
              {[10, 25, 50, 100, 250].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="numeric px-2">
            {currentPage + 1} / {pageCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function priorityClass(priority: 1 | 2 | 3 | undefined): string {
  if (priority === 2) return "hidden md:table-cell";
  if (priority === 3) return "hidden xl:table-cell";
  return "";
}

function formatValue(value: string | number | null | undefined): ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-[var(--text-subtle)]">-</span>;
  }
  return String(value);
}

function humanise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Neutralise formulas — a name like "=cmd" must not execute in Excel.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Convenience renderer for a list of tags in a cell. */
export function TagList({ tags, tone = "neutral" }: { tags: string[]; tone?: Tone }) {
  if (!tags.length) return <span className="text-[var(--text-subtle)]">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 3).map((tag) => (
        <Badge key={tag} tone={tone}>
          {tag}
        </Badge>
      ))}
      {tags.length > 3 ? (
        <Badge tone="neutral">+{tags.length - 3}</Badge>
      ) : null}
    </div>
  );
}
