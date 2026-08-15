"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Download, Play, Sparkles } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  EmptyState,
  Field,
  Input,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatCell, type Dataset } from "@/lib/reporting";

import { runReportAction, type ReportState } from "./actions";

export function ReportBuilder({
  datasets,
  filterOptions,
  aiEnabled,
}: {
  datasets: Dataset[];
  /** Distinct values per dataset per filterable field, derived server-side. */
  filterOptions: Record<string, Record<string, string[]>>;
  aiEnabled: boolean;
}) {
  const [state, action] = useActionState<ReportState, FormData>(runReportAction, {});
  const [datasetKey, setDatasetKey] = useState(datasets[0]?.key ?? "students");
  const [columns, setColumns] = useState<string[]>(
    (datasets[0]?.fields ?? []).slice(0, 6).map((field) => field.key),
  );

  const dataset = useMemo(
    () => datasets.find((entry) => entry.key === datasetKey) ?? datasets[0],
    [datasets, datasetKey],
  );

  function changeDataset(key: string) {
    setDatasetKey(key as typeof datasetKey);
    const next = datasets.find((entry) => entry.key === key);
    // Columns are per-dataset; carrying them over would post keys the new
    // dataset has never heard of and produce a table of empty cells.
    setColumns((next?.fields ?? []).slice(0, 6).map((field) => field.key));
  }

  function toggleColumn(key: string) {
    setColumns((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key],
    );
  }

  const fieldTypes = new Map(dataset.fields.map((field) => [field.key, field.type]));
  const labels = new Map(dataset.fields.map((field) => [field.key, field.label]));

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <form action={action}>
        <Card>
          <CardHeader
            title="Build a report"
            description="Pick a dataset, choose your columns, filter, run."
          />
          <CardBody className="space-y-3">
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

            <Field label="Report name" htmlFor="name">
              <Input
                id="name"
                name="name"
                placeholder={`${dataset.label} report`}
              />
            </Field>

            <Field label="Dataset" htmlFor="dataset" required>
              <SearchableSelect
                id="dataset"
                name="dataset"
                clearable={false}
                value={datasetKey}
                onChange={(value) => changeDataset(value as string)}
                options={datasets.map((entry) => ({
                  value: entry.key,
                  label: entry.label,
                  description: entry.description,
                }))}
              />
            </Field>

            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                Columns
                <span className="ml-1.5 text-[var(--text-subtle)]">
                  {columns.length} selected
                </span>
              </p>
              {columns.map((key) => (
                <input key={key} type="hidden" name="columns" value={key} />
              ))}
              <div className="flex flex-wrap gap-1.5">
                {dataset.fields.map((field) => {
                  const on = columns.includes(field.key);
                  return (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => toggleColumn(field.key)}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                        on
                          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]",
                      )}
                    >
                      {on ? <Check className="size-3" /> : null}
                      {field.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {dataset.fields
              .filter((field) => field.filterable)
              .map((field) => {
                const options = filterOptions[dataset.key]?.[field.key] ?? [];
                if (!options.length) return null;
                return (
                  <Field
                    key={field.key}
                    label={`Filter by ${field.label.toLowerCase()}`}
                    htmlFor={`filter-${field.key}`}
                  >
                    <SearchableSelect
                      id={`filter-${field.key}`}
                      name={`filter:${field.key}`}
                      multiple
                      options={options.map((value) => ({ value, label: value }))}
                      placeholder="Any"
                    />
                  </Field>
                );
              })}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Sort by" htmlFor="sortKey">
                <SearchableSelect
                  id="sortKey"
                  name="sortKey"
                  options={dataset.fields.map((field) => ({
                    value: field.key,
                    label: field.label,
                  }))}
                />
              </Field>
              <Field label="Direction" htmlFor="sortDirection">
                <SearchableSelect
                  id="sortDirection"
                  name="sortDirection"
                  clearable={false}
                  defaultValue="desc"
                  options={[
                    { value: "desc", label: "Highest first" },
                    { value: "asc", label: "Lowest first" },
                  ]}
                />
              </Field>
            </div>

            <Field label="Row limit" htmlFor="limit" hint="Blank returns everything.">
              <Input id="limit" name="limit" type="number" min="1" placeholder="1000" />
            </Field>

            <div className="space-y-2">
              <CheckboxField
                name="includeAiInsights"
                label="Add an AI narrative"
                description={
                  aiEnabled
                    ? "Claude reads the result and says what it shows."
                    : "Needs an Anthropic API key on the server."
                }
                disabled={!aiEnabled}
              />
              <CheckboxField
                name="save"
                label="Save this report"
                description="Keeps the configuration so it can be re-run later."
              />
              <CheckboxField name="isShared" label="Share with other staff" />
            </div>

            <RunButton />
          </CardBody>
        </Card>
      </form>

      <div className="space-y-4">
        {state.ok && state.rows ? (
          <ResultTable
            name={state.name ?? "Report"}
            message={state.message}
            rows={state.rows}
            columns={state.columns ?? []}
            labels={labels}
            types={fieldTypes}
          />
        ) : (
          <Card>
            <EmptyState
              icon={<Play className="size-5" />}
              title="No report run yet"
              description="Configure one on the left and press Run. Nothing is written until you choose to save it."
            />
          </Card>
        )}

        {state.insightId ? (
          <Alert tone="info">
            <span className="flex items-start gap-2">
              <Sparkles className="mt-0.5 size-4 shrink-0" />
              An AI narrative was generated for this run and saved with your insights.
            </span>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

function ResultTable({
  name,
  message,
  rows,
  columns,
  labels,
  types,
}: {
  name: string;
  message?: string;
  rows: Array<Record<string, string | number | null>>;
  columns: string[];
  labels: Map<string, string>;
  types: Map<string, ReturnType<typeof String> | string>;
}) {
  function exportCsv() {
    const header = columns.map((key) => labels.get(key) ?? key);
    const lines = [
      header.join(","),
      ...rows.map((row) =>
        columns
          .map((key) => {
            const value = row[key];
            const text = value === null || value === undefined ? "" : String(value);
            // A leading =, +, - or @ makes a spreadsheet treat the cell as a
            // formula, which is how exported data becomes an attack.
            const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
            return `"${safe.replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader
        title={name}
        description={message}
        action={
          <>
            <Badge tone="info">{rows.length.toLocaleString()} rows</Badge>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-3.5" />
              CSV
            </Button>
          </>
        }
      />
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--bg)]">
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
              {columns.map((key) => (
                <th key={key} className="px-4 py-2 font-medium whitespace-nowrap">
                  {labels.get(key) ?? key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((row, index) => (
              <tr
                key={index}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-subtle)]"
              >
                {columns.map((key) => (
                  <td key={key} className="px-4 py-1.5 whitespace-nowrap">
                    {formatCell(
                      row[key] ?? null,
                      (types.get(key) as never) ?? "text",
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 500 ? (
        <CardBody className="border-t border-[var(--border)]">
          <p className="text-xs text-[var(--text-subtle)]">
            Showing the first 500 of {rows.length.toLocaleString()} rows. Export to CSV
            for the rest — the full set is in the download, not just what is on screen.
          </p>
        </CardBody>
      ) : null}
    </Card>
  );
}

function RunButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <Play className="size-4" />
      {pending ? "Running…" : "Run report"}
    </Button>
  );
}
