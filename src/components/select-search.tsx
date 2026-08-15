"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Searchable select — a Select2-style control built natively.
 *
 * Select2 itself is a jQuery plugin; pulling jQuery into a React app to get
 * one widget would mean two libraries fighting over the same DOM. This is the
 * same behaviour implemented directly: type-to-filter, full keyboard control,
 * optional multi-select and clearing, grouped options.
 *
 * It posts through a hidden input, so it drops into a plain `<form action={…}>`
 * and server actions read it from FormData exactly like a native `<select>`.
 */

export type SelectOption = {
  value: string;
  label: string;
  /** Secondary line, e.g. a class or an outstanding balance. */
  description?: string;
  /** Optional heading this option is filed under. */
  group?: string;
  disabled?: boolean;
};

export type SearchableSelectProps = {
  name?: string;
  options: SelectOption[];
  value?: string | string[];
  defaultValue?: string | string[];
  onChange?: (value: string | string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  multiple?: boolean;
  clearable?: boolean;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Show the search box only once the list is long enough to need it. */
  searchThreshold?: number;
};

export function SearchableSelect({
  name,
  options,
  value,
  defaultValue,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  multiple = false,
  clearable = true,
  required = false,
  disabled = false,
  id,
  className,
  searchThreshold = 7,
}: SearchableSelectProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;

  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<string[]>(() =>
    toArray(defaultValue ?? (multiple ? [] : "")),
  );
  const selected = isControlled ? toArray(value) : internal;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // --- Filtering ----------------------------------------------------------
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    // Every term must match somewhere, so "jhs 2 mensah" narrows progressively.
    const terms = needle.split(/\s+/);
    return options.filter((option) => {
      const haystack =
        `${option.label} ${option.description ?? ""} ${option.group ?? ""}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [options, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, SelectOption[]>();
    for (const option of filtered) {
      const key = option.group ?? "";
      map.set(key, [...(map.get(key) ?? []), option]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // Flat order drives keyboard movement across group boundaries.
  const flat = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);

  const selectedOptions = useMemo(
    () => options.filter((option) => selected.includes(option.value)),
    [options, selected],
  );

  // --- Open / close -------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      // Focus after paint so the panel exists to receive it.
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${highlight}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function commit(next: string[]) {
    if (!isControlled) setInternal(next);
    onChange?.(multiple ? next : (next[0] ?? ""));
  }

  function toggle(option: SelectOption) {
    if (option.disabled) return;

    if (multiple) {
      commit(
        selected.includes(option.value)
          ? selected.filter((entry) => entry !== option.value)
          : [...selected, option.value],
      );
      return;
    }

    commit([option.value]);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) setOpen(true);
        else setHighlight((current) => Math.min(current + 1, flat.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlight((current) => Math.max(current - 1, 0));
        break;
      case "Enter":
        if (open) {
          event.preventDefault();
          const option = flat[highlight];
          if (option) toggle(option);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  }

  const hasValue = selected.length > 0;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {/* Values post exactly as a native select would. */}
      {name
        ? (multiple ? selected : selected.slice(0, 1)).map((entry) => (
            <input key={entry} type="hidden" name={name} value={entry} />
          ))
        : null}
      {/* Keeps native required validation working with the hidden inputs. */}
      {name && required && !hasValue ? (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value=""
          onChange={() => undefined}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      ) : null}

      <button
        type="button"
        id={controlId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "input-base flex min-h-9.5 items-center gap-2 text-left",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span className="min-w-0 flex-1">
          {selectedOptions.length === 0 ? (
            <span className="text-[var(--text-subtle)]">{placeholder}</span>
          ) : multiple ? (
            <span className="flex flex-wrap gap-1">
              {selectedOptions.map((option) => (
                <span
                  key={option.value}
                  className="inline-flex items-center gap-1 rounded bg-[var(--primary-soft)] px-1.5 py-0.5 text-xs text-[var(--primary)]"
                >
                  {option.label}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${option.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      commit(selected.filter((entry) => entry !== option.value));
                    }}
                    className="hover:opacity-70"
                  >
                    <X className="size-3" />
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="block truncate">
              {selectedOptions[0].label}
              {selectedOptions[0].description ? (
                <span className="ml-1.5 text-xs text-[var(--text-subtle)]">
                  {selectedOptions[0].description}
                </span>
              ) : null}
            </span>
          )}
        </span>

        {clearable && hasValue && !disabled ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear selection"
            onClick={(event) => {
              event.stopPropagation();
              commit([]);
            }}
            className="shrink-0 rounded p-0.5 text-[var(--text-subtle)] hover:text-[var(--text)]"
          >
            <X className="size-3.5" />
          </span>
        ) : null}

        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-[var(--text-subtle)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="card absolute z-50 mt-1 w-full overflow-hidden p-0 shadow-lg">
          {options.length >= searchThreshold ? (
            <div className="relative border-b border-[var(--border)]">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--text-subtle)]" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlight(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full bg-transparent py-2 pr-2 pl-8 text-sm outline-none"
              />
            </div>
          ) : null}

          <ul
            ref={listRef}
            role="listbox"
            aria-multiselectable={multiple}
            className="max-h-64 overflow-y-auto p-1"
          >
            {flat.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                {emptyText}
              </li>
            ) : (
              grouped.map(([group, items]) => (
                <li key={group || "_"}>
                  {group ? (
                    <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                      {group}
                    </p>
                  ) : null}
                  <ul>
                    {items.map((option) => {
                      const index = flat.indexOf(option);
                      const isSelected = selected.includes(option.value);
                      return (
                        <li key={option.value}>
                          <button
                            type="button"
                            role="option"
                            data-index={index}
                            aria-selected={isSelected}
                            disabled={option.disabled}
                            onClick={() => toggle(option)}
                            onMouseEnter={() => setHighlight(index)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                              index === highlight && "bg-[var(--bg-subtle)]",
                              isSelected && "text-[var(--primary)]",
                              option.disabled && "cursor-not-allowed opacity-50",
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{option.label}</span>
                              {option.description ? (
                                <span className="block truncate text-xs text-[var(--text-subtle)]">
                                  {option.description}
                                </span>
                              ) : null}
                            </span>
                            {isSelected ? (
                              <Check className="size-4 shrink-0" />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}
