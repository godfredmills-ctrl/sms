"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, CircleSlash, Wallet } from "lucide-react";

import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { PAYMENT_METHODS } from "@/lib/expense-labels";

import { decideExpenseAction } from "./actions";

/**
 * The decision on a bill.
 *
 * Which buttons appear is decided on the server from the same transition
 * table the action enforces, and passed in — so a button that appears is a
 * button that works. Marking something paid opens a small form first, because
 * "paid" without a date and a method is a claim rather than a record, and the
 * bank statement it has to be reconciled against has both.
 */
export function Decide({
  id,
  allowed,
  today,
}: {
  id: string;
  allowed: string[];
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [note, setNote] = useState("");

  async function decide(status: string, extra?: Record<string, string>) {
    setBusy(status);
    setProblem(null);
    const data = new FormData();
    data.append("id", id);
    data.append("status", status);
    if (note.trim()) data.append("note", note.trim());
    for (const [key, value] of Object.entries(extra ?? {})) data.append(key, value);

    const result = await decideExpenseAction(data);
    setBusy(null);
    if (result.error) {
      setProblem(result.error);
      return;
    }
    setPaying(false);
    setNote("");
    router.refresh();
  }

  if (allowed.length === 0) return null;

  return (
    <div className="space-y-3">
      {problem ? <Alert tone="danger">{problem}</Alert> : null}

      {paying ? (
        <form
          className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void decide("PAID", {
              paidOn: String(form.get("paidOn") ?? ""),
              method: String(form.get("method") ?? ""),
              paymentRef: String(form.get("paymentRef") ?? ""),
            });
          }}
        >
          <Field label="Date paid" htmlFor="pay-date" required>
            <Input id="pay-date" name="paidOn" type="date" required defaultValue={today} />
          </Field>
          <Field label="How" htmlFor="pay-method" required>
            <Select id="pay-method" name="method" required defaultValue="BANK_TRANSFER">
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Reference"
            htmlFor="pay-ref"
            hint="Cheque number, transfer reference, momo transaction id."
          >
            <Input id="pay-ref" name="paymentRef" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy !== null}>
              {busy === "PAID" ? "Recording…" : "Record the payment"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPaying(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {allowed.includes("REJECTED") || allowed.includes("VOID") ? (
        <Field
          label="Note"
          htmlFor="decide-note"
          hint="Shown to whoever recorded it. Required in spirit if you are turning it down."
        >
          <Textarea
            id="decide-note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {allowed.includes("APPROVED") ? (
          <Button disabled={busy !== null} onClick={() => decide("APPROVED")}>
            <Check className="size-4" />
            {busy === "APPROVED" ? "Approving…" : "Approve"}
          </Button>
        ) : null}

        {allowed.includes("PAID") && !paying ? (
          <Button variant="secondary" disabled={busy !== null} onClick={() => setPaying(true)}>
            <Wallet className="size-4" />
            Mark paid
          </Button>
        ) : null}

        {allowed.includes("REJECTED") ? (
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => decide("REJECTED")}
          >
            <CircleSlash className="size-4" />
            {busy === "REJECTED" ? "Turning down…" : "Turn down"}
          </Button>
        ) : null}

        {allowed.includes("PENDING") ? (
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => decide("PENDING")}
          >
            {busy === "PENDING" ? "Reopening…" : "Send back for approval"}
          </Button>
        ) : null}

        {allowed.includes("VOID") ? (
          <Button variant="ghost" disabled={busy !== null} onClick={() => decide("VOID")}>
            <Ban className="size-4" />
            {busy === "VOID" ? "Voiding…" : "Void"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
