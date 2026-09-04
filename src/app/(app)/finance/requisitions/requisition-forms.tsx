"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Plus, Send, Trash2, X } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Textarea,
} from "@/components/ui";
import { formatMoney } from "@/lib/money";
import {
  allowedTransitions,
  budgetTone,
  estimateTotal,
  statusLabel,
  type Role,
  type Verdict,
} from "@/lib/requisition-rules";

import {
  moveRequisitionAction,
  receiveRequisitionAction,
  saveRequisitionAction,
  type RequisitionState,
} from "./actions";

export type LineDraft = {
  description: string;
  quantity: string;
  price: string;
  unit: string;
  stockItemId: string;
};

const BLANK: LineDraft = {
  description: "",
  quantity: "",
  price: "",
  unit: "",
  stockItemId: "",
};

/**
 * Raising one, or editing a draft.
 *
 * The running total is on screen while it is typed, because the number that
 * decides whether this gets approved is the one nobody works out until the
 * form is submitted, and by then they have stopped thinking about whether they
 * need forty of something.
 */
export function RequisitionForm({
  id,
  categories,
  stockItems,
  values,
}: {
  id: string | null;
  categories: Array<{ value: string; label: string; description?: string }>;
  stockItems: Array<{ value: string; label: string; description?: string }>;
  values: {
    title: string;
    categoryId: string;
    department: string;
    justification: string;
    neededBy: string;
    lines: LineDraft[];
  };
}) {
  const [state, action] = useActionState<RequisitionState, FormData>(
    saveRequisitionAction,
    {},
  );
  const [lines, setLines] = useState<LineDraft[]>(
    values.lines.length ? values.lines : [BLANK],
  );

  const total = estimateTotal(
    lines.map((line) => ({
      quantity: Number(line.quantity) || 0,
      estimatedUnitMinor: line.price ? Math.round(Number(line.price) * 100) : 0,
    })),
  );

  const set = (index: number, patch: Partial<LineDraft>) =>
    setLines((rows) => rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  return (
    <form action={action} className="space-y-4">
      {id ? <input type="hidden" name="id" value={id} /> : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <Card>
        <CardHeader
          title="What it is for"
          description="Read by whoever approves it, and by whoever asks in April what this was."
        />
        <CardBody className="space-y-3">
          <Field label="Title" htmlFor="req-title" required>
            <Input
              id="req-title"
              name="title"
              defaultValue={values.title}
              placeholder="Exercise books for the JHS block"
              required
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Budget it comes from"
              htmlFor="req-category"
              required
              hint="The same categories the bills are filed under."
            >
              <SearchableSelect
                id="req-category"
                name="categoryId"
                clearable={false}
                defaultValue={values.categoryId}
                options={categories}
                placeholder="Choose a category"
              />
            </Field>

            <Field label="Department" htmlFor="req-department">
              <Input
                id="req-department"
                name="department"
                defaultValue={values.department}
                placeholder="Science"
              />
            </Field>
          </div>

          <Field
            label="Needed by"
            htmlFor="req-needed"
            hint="A request for week one raised in the holidays is a different thing from the same request raised in week three."
          >
            <Input
              id="req-needed"
              name="neededBy"
              type="date"
              defaultValue={values.neededBy}
            />
          </Field>

          <Field
            label="Why"
            htmlFor="req-justification"
            hint="Optional, and the first thing an approver reads."
          >
            <Textarea
              id="req-justification"
              name="justification"
              rows={3}
              defaultValue={values.justification}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="What is being asked for"
          description="Prices are estimates. The bill decides the real figure."
          action={
            <span className="numeric text-sm font-semibold">{formatMoney(total)}</span>
          }
        />
        <CardBody className="space-y-3">
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid items-end gap-2 rounded-xl border border-[var(--border)] p-3 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_7rem_2.5rem]"
            >
              <Field label={index === 0 ? "Item" : undefined} htmlFor={`line-${index}`}>
                <Input
                  id={`line-${index}`}
                  name="lineDescription"
                  value={line.description}
                  onChange={(event) => set(index, { description: event.target.value })}
                  placeholder="Exercise books, 80 leaves"
                />
              </Field>

              <Field label={index === 0 ? "How many" : undefined}>
                <Input
                  name="lineQuantity"
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(event) => set(index, { quantity: event.target.value })}
                />
              </Field>

              <Field label={index === 0 ? "Unit" : undefined}>
                <Input
                  name="lineUnit"
                  value={line.unit}
                  onChange={(event) => set(index, { unit: event.target.value })}
                  placeholder="box"
                />
              </Field>

              <Field label={index === 0 ? "Each (GHS)" : undefined}>
                <Input
                  name="linePrice"
                  inputMode="decimal"
                  value={line.price}
                  onChange={(event) => set(index, { price: event.target.value })}
                />
              </Field>

              <input type="hidden" name="lineStockItem" value={line.stockItemId} />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove this line"
                onClick={() =>
                  setLines((rows) =>
                    rows.length === 1 ? [BLANK] : rows.filter((_, at) => at !== index),
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="secondary"
            onClick={() => setLines((rows) => [...rows, BLANK])}
          >
            <Plus className="size-4" />
            Another line
          </Button>

          {stockItems.length ? (
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              If the store already carries it, say so in the item name the way
              the store lists it. The storekeeper issues against this rather
              than buying it again.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Save label={id ? "Save the draft" : "Raise it"} />
        <p className="self-center text-xs text-[var(--text-muted)]">
          Saved as a draft. Sending it for approval is a separate button, so a
          half-written request is not on somebody desk by accident.
        </p>
      </div>
    </form>
  );
}

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Check className="size-4" />
      {pending ? "Saving…" : label}
    </Button>
  );
}

/**
 * The buttons that move it along, drawn from the same table the action
 * refuses from.
 *
 * The note box appears for the two steps that need one and is labelled
 * differently for each, because "why" means something different when you are
 * turning something down and when you are signing an overspend.
 */
export function MoveForm({
  id,
  status,
  roles,
  verdict,
  requestMinor,
}: {
  id: string;
  status: string;
  roles: Role[];
  verdict: Verdict;
  requestMinor: number;
}) {
  const [state, action] = useActionState<RequisitionState, FormData>(
    moveRequisitionAction,
    {},
  );
  const [to, setTo] = useState<string | null>(null);

  const options = allowedTransitions(status, roles);
  if (options.length === 0) {
    return state.error ? <Alert tone="danger">{state.error}</Alert> : null;
  }

  const needsNote = to === "REJECTED" || (to === "APPROVED" && verdict.overBudget);

  return (
    <div className="space-y-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      {to === "APPROVED" && verdict.overBudget ? (
        <Alert tone="warning" title="This takes the line over its budget">
          By {formatMoney(verdict.overByMinor)}. Approving it is allowed and
          schools do it; doing it without a word is what this box is for.
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.to}
            type="button"
            variant={
              option.to === "APPROVED"
                ? "primary"
                : option.to === "REJECTED"
                  ? "danger"
                  : "secondary"
            }
            onClick={() => setTo(option.to)}
          >
            {option.to === "SUBMITTED" ? <Send className="size-4" /> : null}
            {option.label}
          </Button>
        ))}
      </div>

      {to ? (
        <form action={action} className="space-y-3 rounded-xl bg-[var(--bg-subtle)] p-3">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="to" value={to} />

          <p className="text-sm">
            {options.find((option) => option.to === to)?.label}, and it becomes{" "}
            <strong>{statusLabel(to).toLowerCase()}</strong>.
            {to === "APPROVED" && !verdict.unbudgeted && !verdict.overBudget ? (
              <>
                {" "}
                {formatMoney(requestMinor)} of{" "}
                {formatMoney(verdict.remainingMinor ?? 0)} left on the line.
              </>
            ) : null}
          </p>

          {needsNote || to === "APPROVED" || to === "CANCELLED" ? (
            <Field
              label={to === "REJECTED" ? "Why it is being turned down" : "Note"}
              htmlFor={`note-${to}`}
              required={needsNote}
              hint={
                to === "REJECTED"
                  ? "The person who asked reads this and edits accordingly."
                  : to === "APPROVED" && verdict.overBudget
                    ? "Who agreed, and what made it necessary."
                    : "Optional."
              }
            >
              <Textarea id={`note-${to}`} name="note" rows={2} />
            </Field>
          ) : null}

          <div className="flex gap-2">
            <Confirm label={options.find((option) => option.to === to)?.label ?? "Do it"} />
            <Button type="button" variant="ghost" onClick={() => setTo(null)}>
              <X className="size-4" />
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Confirm({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Check className="size-4" />
      {pending ? "Saving…" : label}
    </Button>
  );
}

/**
 * Recording what actually arrived.
 *
 * Per line, because half a delivery is the normal case: two of the four boxes
 * came, the rest is on back order, and the budget should show the rest still
 * committed rather than released or complete.
 */
export function ReceiveForm({
  id,
  lines,
}: {
  id: string;
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unit: string | null;
    fulfilledQty: number;
  }>;
}) {
  const [state, action] = useActionState<RequisitionState, FormData>(
    receiveRequisitionAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      {lines.map((line) => (
        <div key={line.id} className="flex items-center gap-3">
          <input type="hidden" name="lineId" value={line.id} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{line.description}</p>
            <p className="numeric text-xs text-[var(--text-subtle)]">
              {line.quantity} {line.unit ?? "asked for"}
            </p>
          </div>
          <Input
            name="lineReceived"
            inputMode="numeric"
            className="w-20"
            defaultValue={String(line.fulfilledQty)}
            aria-label={`Received of ${line.description}`}
          />
          {line.fulfilledQty >= line.quantity ? (
            <Badge tone="success">All in</Badge>
          ) : line.fulfilledQty > 0 ? (
            <Badge tone="warning">Part</Badge>
          ) : (
            <Badge tone="neutral">None</Badge>
          )}
        </div>
      ))}

      <Receive />
    </form>
  );
}

function Receive() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      <Check className="size-4" />
      {pending ? "Recording…" : "Record what arrived"}
    </Button>
  );
}

/** The budget line, as the person deciding sees it. */
export function BudgetStrip({
  verdict,
  requestMinor,
}: {
  verdict: Verdict;
  requestMinor: number;
}) {
  if (verdict.unbudgeted) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Nothing has been budgeted for this category this year, so there is no
        line to measure it against. That is not the same as being over.
      </p>
    );
  }

  const tone = budgetTone(verdict);
  const colour =
    tone === "danger"
      ? "var(--danger)"
      : tone === "warning"
        ? "var(--warning)"
        : "var(--success)";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span>
          {formatMoney(verdict.remainingMinor ?? 0)} left, before this
        </span>
        <span className="numeric font-semibold" style={{ color: colour }}>
          {verdict.overBudget
            ? `${formatMoney(verdict.overByMinor)} over`
            : `${formatMoney(verdict.wouldRemainMinor ?? 0)} after`}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${Math.min(100, verdict.usedRatio * 100)}%`,
            background: colour,
          }}
        />
      </div>

      <p className="text-xs text-[var(--text-subtle)]">
        This request is {formatMoney(requestMinor)}. The bar counts what has
        been spent, what is already committed, and this.
      </p>
    </div>
  );
}
