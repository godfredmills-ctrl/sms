"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, FileUp, TriangleAlert, Upload } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  Field,
} from "@/components/ui";

import { importStudentsAction, IMPORT_FIELDS, type ImportState } from "./actions";

export function ImportForm() {
  const [state, action] = useActionState<ImportState, FormData>(
    importStudentsAction,
    {},
  );
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <form action={action}>
        <Card>
          <CardHeader
            title="Upload a spreadsheet"
            description=".xlsx from Excel, Google Sheets or LibreOffice."
          />
          <CardBody className="space-y-3">
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

            <Field label="File" htmlFor="file" required>
              <label
                htmlFor="file"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--border-strong)] px-4 py-8 text-center transition-colors hover:bg-[var(--bg-subtle)]"
              >
                <Upload className="size-6 text-[var(--text-subtle)]" />
                <span className="text-sm font-medium">
                  {fileName ?? "Choose a file"}
                </span>
                <span className="text-xs text-[var(--text-subtle)]">
                  Up to 10 MB — split larger files into batches
                </span>
                <input
                  id="file"
                  name="file"
                  type="file"
                  accept=".xlsx,.xls"
                  required
                  className="sr-only"
                  onChange={(event) =>
                    setFileName(event.target.files?.[0]?.name ?? null)
                  }
                />
              </label>
            </Field>

            <CheckboxField
              name="dryRun"
              defaultChecked
              label="Dry run"
              description="Validates every row and reports what would happen, without writing anything. Run this first."
            />

            <Submit />

            <p className="text-xs text-[var(--text-subtle)]">
              Column headings are matched loosely — “Admission No.”, “admission_no” and
              “ADMISSION NUMBER” all work.
            </p>
          </CardBody>
        </Card>
      </form>

      <div className="space-y-4">
        {state.ok ? (
          <Card>
            <CardHeader
              title={state.dryRun ? "Dry run result" : "Import complete"}
              action={
                <Badge tone={state.dryRun ? "info" : "success"}>
                  {state.dryRun ? "Nothing written" : "Saved"}
                </Badge>
              }
            />
            <CardBody className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-[var(--bg-subtle)] p-3">
                  <p className="numeric text-xl font-semibold">{state.total}</p>
                  <p className="text-xs text-[var(--text-muted)]">rows read</p>
                </div>
                <div className="rounded-lg bg-[var(--success-soft)] p-3">
                  <p className="numeric text-xl font-semibold text-[var(--success)]">
                    {state.imported}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {state.dryRun ? "would import" : "imported"}
                  </p>
                </div>
                <div
                  className={`rounded-lg p-3 ${
                    state.skipped ? "bg-[var(--warning-soft)]" : "bg-[var(--bg-subtle)]"
                  }`}
                >
                  <p className="numeric text-xl font-semibold">{state.skipped}</p>
                  <p className="text-xs text-[var(--text-muted)]">skipped</p>
                </div>
              </div>

              {state.dryRun && state.imported ? (
                <Alert tone="info">
                  <span className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                    Nothing has been written. Untick “Dry run” and upload the same file
                    to import for real.
                  </span>
                </Alert>
              ) : null}

              {state.mapped ? (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                    Columns matched
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(state.mapped).map(([field, header]) => (
                      <Badge key={field} tone="success">
                        {header} → {field}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {state.unmatched?.length ? (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                    Columns ignored
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {state.unmatched.map((header) => (
                      <Badge key={header} tone="neutral">
                        {header}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {state.problems?.length ? (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--warning)]">
                    <TriangleAlert className="size-3.5" />
                    {state.problems.length} row
                    {state.problems.length === 1 ? "" : "s"} need attention
                  </p>
                  <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
                    {state.problems.map((problem, index) => (
                      <li
                        key={index}
                        className="rounded border border-[var(--border)] px-2 py-1"
                      >
                        <span className="numeric font-medium">Row {problem.row}</span> ·{" "}
                        {problem.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Expected columns" />
            <CardBody>
              <p className="mb-3 text-sm text-[var(--text-muted)]">
                Only <strong>First name</strong> and <strong>Last name</strong> are
                required. Everything else is optional and filled in where present.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {IMPORT_FIELDS.map((field) => (
                  <Badge
                    key={field.key}
                    tone={
                      field.key === "firstName" || field.key === "lastName"
                        ? "success"
                        : "neutral"
                    }
                  >
                    {field.label}
                  </Badge>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--text-subtle)]">
                Dates in dd/mm/yyyy are read as Ghanaian dates, not American ones — a
                date of 03/04/2011 imports as 3 April.
              </p>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <FileUp className="size-4" />
      {pending ? "Processing…" : "Process file"}
    </Button>
  );
}
