"use client";

import { useState, useTransition } from "react";
import { FilePlus2 } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, CardBody, CheckboxField, Field } from "@/components/ui";
import { formatMoney } from "@/lib/money";

import { generateInvoicesAction } from "../actions";

type Result = {
  ok: boolean;
  error?: string;
  created?: number;
  skipped?: number;
  totalBilledMinor?: number;
  errors?: Array<{ studentId: string; message: string }>;
};

export function GenerateForm({
  years,
  terms,
}: {
  years: SelectOption[];
  terms: SelectOption[];
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      action={(formData) => {
        start(async () => {
          setResult((await generateInvoicesAction(formData)) as Result);
        });
      }}
    >
      <CardBody className="space-y-3">
        {result?.error ? <Alert tone="danger">{result.error}</Alert> : null}

        {result?.ok ? (
          <Alert tone={result.created ? "success" : "info"}>
            <p>
              {result.created} invoice{result.created === 1 ? "" : "s"} totalling{" "}
              {formatMoney(result.totalBilledMinor ?? 0)}.
              {result.skipped ? ` ${result.skipped} skipped.` : ""}
            </p>
            {result.errors?.length ? (
              <ul className="mt-1.5 list-inside list-disc text-xs">
                {result.errors.slice(0, 5).map((entry) => (
                  <li key={entry.studentId}>{entry.message}</li>
                ))}
                {result.errors.length > 5 ? (
                  <li>and {result.errors.length - 5} more</li>
                ) : null}
              </ul>
            ) : null}
          </Alert>
        ) : null}

        <Field label="Academic year" htmlFor="academicYearId" required>
          <SearchableSelect
            id="academicYearId"
            name="academicYearId"
            options={years}
            defaultValue={years[0]?.value}
            clearable={false}
            required
          />
        </Field>

        <Field label="Term" htmlFor="termId" required>
          <SearchableSelect
            id="termId"
            name="termId"
            options={terms}
            defaultValue={terms[0]?.value}
            clearable={false}
            required
          />
        </Field>

        <CheckboxField
          name="dryRun"
          defaultChecked
          label="Dry run"
          description="Reports what would be billed without writing anything. Run this first: bulk billing touches every enrolled student."
        />

        <Button type="submit" variant="outline" className="w-full" disabled={pending}>
          <FilePlus2 className="size-4" />
          {pending ? "Working…" : "Generate term invoices"}
        </Button>
      </CardBody>
    </form>
  );
}
