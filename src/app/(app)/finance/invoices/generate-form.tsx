"use client";

import { useState, useTransition } from "react";
import { FilePlus2 } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, CardBody, CheckboxField, Field, Select } from "@/components/ui";
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
  months,
  hasMonthly,
}: {
  years: SelectOption[];
  terms: SelectOption[];
  /** Billable months of the year, newest first, already excluding the future. */
  months: SelectOption[];
  /** Whether any published structure bills monthly at all. */
  hasMonthly: boolean;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const [cycle, setCycle] = useState<"TERM" | "MONTHLY">("TERM");

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

        {/* Only offered when the school actually has a monthly structure. A
            school that bills termly should not be asked to decide something
            it has no answer to. */}
        {hasMonthly ? (
          <Field
            label="What to bill"
            htmlFor="cycle"
            hint="The two are billed separately: a monthly tuition structure and a termly levy each need their own run."
          >
            <Select
              id="cycle"
              name="cycle"
              value={cycle}
              onChange={(event) => setCycle(event.target.value as "TERM" | "MONTHLY")}
            >
              <option value="TERM">Termly structures</option>
              <option value="MONTHLY">Monthly structures</option>
            </Select>
          </Field>
        ) : null}

        {hasMonthly && cycle === "MONTHLY" ? (
          <Field
            label="Month"
            htmlFor="month"
            required
            hint="Months that have started, within terms of this year. A month cannot be billed before it begins."
          >
            <SearchableSelect
              id="month"
              name="month"
              options={months}
              defaultValue={months[0]?.value}
              clearable={false}
              required
            />
          </Field>
        ) : null}

        <CheckboxField
          name="dryRun"
          defaultChecked
          label="Dry run"
          description="Reports what would be billed without writing anything. Run this first: bulk billing touches every enrolled student."
        />

        <Button type="submit" variant="outline" className="w-full" disabled={pending}>
          <FilePlus2 className="size-4" />
          {pending
            ? "Working…"
            : cycle === "MONTHLY"
              ? "Generate the invoices for this month"
              : "Generate term invoices"}
        </Button>
      </CardBody>
    </form>
  );
}
