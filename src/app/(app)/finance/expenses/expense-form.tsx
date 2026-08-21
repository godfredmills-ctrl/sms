"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Save } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Textarea,
} from "@/components/ui";
import { formatMoney } from "@/lib/money";

import { saveExpenseAction, type ExpenseState } from "./actions";

export type ExpenseDraft = {
  id: string;
  description: string;
  categoryId: string;
  vendorId: string;
  amount: string;
  tax: string;
  incurredOn: string;
  notes: string;
};

/**
 * Recording a bill.
 *
 * The amount and the withholding tax sit together because they are one
 * decision: the tax is kept back out of the amount rather than added to it,
 * and the form says so as you type. A bursar who reads it the other way pays
 * the supplier too much and files a return that does not match.
 */
export function ExpenseForm({
  draft,
  categories,
  vendors,
  today,
}: {
  draft?: ExpenseDraft;
  categories: SelectOption[];
  vendors: SelectOption[];
  /** Today, from the server, so the default date is the school's day. */
  today: string;
}) {
  const [state, action] = useActionState<ExpenseState, FormData>(saveExpenseAction, {});
  const [amount, setAmount] = useState(draft?.amount ?? "");
  const [tax, setTax] = useState(draft?.tax ?? "");

  const amountValue = Number.parseFloat(amount);
  const taxValue = Number.parseFloat(tax);
  const payable =
    Number.isFinite(amountValue) && amountValue > 0
      ? Math.round((amountValue - (Number.isFinite(taxValue) ? taxValue : 0)) * 100)
      : null;

  return (
    <form action={action} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {draft ? <input type="hidden" name="id" value={draft.id} /> : null}

      <div className="min-w-0 space-y-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Card>
          <CardHeader title="The bill" />
          <CardBody className="space-y-3">
            <Field label="What was it for" htmlFor="exp-description" required>
              <Input
                id="exp-description"
                name="description"
                required
                defaultValue={draft?.description}
                placeholder="Generator servicing and two filters"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category" htmlFor="exp-category" required>
                <SearchableSelect
                  id="exp-category"
                  name="categoryId"
                  options={categories}
                  defaultValue={draft?.categoryId || undefined}
                  placeholder="Choose a category"
                />
              </Field>
              <Field
                label="Vendor"
                htmlFor="exp-vendor"
                hint="Optional — a market purchase may have none."
              >
                <SearchableSelect
                  id="exp-vendor"
                  name="vendorId"
                  options={vendors}
                  defaultValue={draft?.vendorId || undefined}
                  placeholder="Nobody in particular"
                />
              </Field>
            </div>

            <Field
              label="Notes"
              htmlFor="exp-notes"
              hint="Anything the approver needs — a quotation number, why it was urgent."
            >
              <Textarea
                id="exp-notes"
                name="notes"
                rows={3}
                defaultValue={draft?.notes}
              />
            </Field>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Amount" />
          <CardBody className="space-y-3">
            <Field label="Amount of the bill" htmlFor="exp-amount" required>
              <Input
                id="exp-amount"
                name="amount"
                required
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field
              label="Withholding tax"
              htmlFor="exp-tax"
              hint="Kept back from the amount above and paid to the GRA, not added on top."
            >
              <Input
                id="exp-tax"
                name="tax"
                inputMode="decimal"
                value={tax}
                onChange={(event) => setTax(event.target.value)}
                placeholder="0.00"
              />
            </Field>
            {payable !== null ? (
              <p className="text-sm text-[var(--text-muted)]">
                The vendor receives{" "}
                <span className="numeric font-medium text-[var(--text)]">
                  {formatMoney(payable)}
                </span>
                . The full amount is what the statement counts as the cost.
              </p>
            ) : null}

            <Field
              label="Date incurred"
              htmlFor="exp-date"
              required
              hint="Which term this belongs to is decided by this date, not by when it is paid."
            >
              <Input
                id="exp-date"
                name="incurredOn"
                type="date"
                required
                defaultValue={draft?.incurredOn ?? today}
              />
            </Field>
          </CardBody>
        </Card>

        <Alert tone="info">
          It is recorded as awaiting approval. Somebody other than you has to approve
          it before it counts as spending.
        </Alert>

        <SaveButton isNew={!draft} />
      </div>
    </form>
  );
}

function SaveButton({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      <Save className="size-4" />
      {pending ? "Saving…" : isNew ? "Record it" : "Save changes"}
    </Button>
  );
}
