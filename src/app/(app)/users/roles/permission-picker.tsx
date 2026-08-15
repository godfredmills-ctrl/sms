"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Save, Search } from "lucide-react";

import { Badge, Button, Input } from "@/components/ui";
import { cn, humanise } from "@/lib/utils";

import { setRolePermissionsAction } from "../actions";

export type PermissionOption = {
  key: string;
  module: string;
  action: string;
  description: string;
};

export function PermissionPicker({
  roleId,
  permissions,
  granted,
  disabled,
}: {
  roleId: string;
  permissions: PermissionOption[];
  granted: string[];
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(granted));
  const [query, setQuery] = useState("");

  const modules = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = permissions.filter((permission) =>
      terms.every(
        (term) =>
          permission.key.toLowerCase().includes(term) ||
          permission.description.toLowerCase().includes(term),
      ),
    );

    const grouped = new Map<string, PermissionOption[]>();
    for (const permission of matches) {
      const list = grouped.get(permission.module) ?? [];
      list.push(permission);
      grouped.set(permission.module, list);
    }
    return [...grouped.entries()];
  }, [permissions, query]);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleModule(module: string, keys: string[]) {
    setSelected((current) => {
      const next = new Set(current);
      const allOn = keys.every((key) => next.has(key));
      for (const key of keys) {
        if (allOn) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  if (disabled) {
    return (
      <div className="p-5 text-sm text-[var(--text-muted)]">
        The system administrator role bypasses the permission table entirely, so
        there is nothing to edit here. Editing these rows would imply a restriction
        the code does not honour.
      </div>
    );
  }

  return (
    <form action={setRolePermissionsAction}>
      <input type="hidden" name="roleId" value={roleId} />
      {[...selected].map((key) => (
        <input key={key} type="hidden" name="permissions" value={key} />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[var(--text-subtle)]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter permissions…"
            className="pl-8"
          />
        </div>
        <Badge tone="info">{selected.size} granted</Badge>
        <SaveButton />
      </div>

      <div className="max-h-[560px] space-y-4 overflow-y-auto p-5">
        {modules.map(([module, items]) => {
          const keys = items.map((item) => item.key);
          const allOn = keys.every((key) => selected.has(key));
          const someOn = !allOn && keys.some((key) => selected.has(key));

          return (
            <div key={module}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold tracking-wide uppercase">
                  {humanise(module)}
                </h3>
                <button
                  type="button"
                  onClick={() => toggleModule(module, keys)}
                  className="text-xs text-[var(--primary)] hover:underline"
                >
                  {allOn ? "Clear all" : someOn ? "Select all" : "Select all"}
                </button>
              </div>
              <ul className="grid gap-1 sm:grid-cols-2">
                {items.map((permission) => {
                  const on = selected.has(permission.key);
                  return (
                    <li key={permission.key}>
                      <button
                        type="button"
                        onClick={() => toggle(permission.key)}
                        aria-pressed={on}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-lg border p-2 text-left transition-colors",
                          on
                            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                            : "border-[var(--border)] hover:bg-[var(--bg-subtle)]",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                            on
                              ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                              : "border-[var(--border-strong)]",
                          )}
                        >
                          {on ? <Check className="size-3" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-medium">
                            {permission.description}
                          </span>
                          <span className="block font-mono text-[10px] text-[var(--text-subtle)]">
                            {permission.key}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {modules.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No permissions match.</p>
        ) : null}
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Save className="size-3.5" />
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}
