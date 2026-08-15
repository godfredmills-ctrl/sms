"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Receipt } from "lucide-react";
import type { PaymentChannel } from "@prisma/client";

import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  LinkButton,
  Select,
  Textarea,
} from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { detectMomoNetwork, formatDate } from "@/lib/utils";

import { recordPaymentAction, type RecordPaymentState } from "../../actions";

export type PayableStudent = {
  id: string;
  label: string;
  outstandingMinor: number;
  invoices: Array<{
    id: string;
    invoiceNo: string;
    balanceMinor: number;
    dueDate: string | null;
  }>;
  guardianPhone: string | null;
};

const CHANNELS: Array<{ value: PaymentChannel; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "POS", label: "POS / Card terminal" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "SCHOLARSHIP", label: "Scholarship / Waiver" },
];

const MOMO_NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO"];

export function RecordPaymentForm({
  students,
  initialStudentId,
}: {
  students: PayableStudent[];
  initialStudentId?: string;
}) {
  const [state, action] = useActionState<RecordPaymentState, FormData>(
    recordPaymentAction,
    {},
  );
  const [studentId, setStudentId] = useState(initialStudentId ?? "");
  const [channel, setChannel] = useState<PaymentChannel>("CASH");
  const [amount, setAmount] = useState("");
  const [invoiceId, setInvoiceId] = useState("");

  const student = useMemo(
    () => students.find((entry) => entry.id === studentId),
    [students, studentId],
  );

  const amountMinor = Math.round(Number.parseFloat(amount || "0") * 100);
  const remaining = student ? student.outstandingMinor - amountMinor : 0;

  if (state.ok) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
            <CheckCircle2 className="size-6" />
          </span>
          <h2 className="text-lg font-semibold">Payment recorded</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Receipt <span className="numeric font-medium">{state.receiptNo}</span> has
            been issued and the invoice balance updated.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <LinkButton href={`/finance/receipts/${state.receiptNo}`} variant="outline">
              <Receipt className="size-4" />
              Print receipt
            </LinkButton>
            <LinkButton href="/finance/payments/new">Record another</LinkButton>
            <LinkButton href="/finance" variant="ghost">
              Back to finance
            </LinkButton>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <form action={action}>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader
            title="Payment details"
            description="Part payments are expected — record whatever the family has brought."
          />
          <CardBody className="space-y-4">
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

            <Field label="Student" htmlFor="studentId" required>
              <Select
                id="studentId"
                name="studentId"
                value={studentId}
                onChange={(event) => {
                  setStudentId(event.target.value);
                  setInvoiceId("");
                }}
                required
              >
                <option value="">Select a student…</option>
                {students.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                    {entry.outstandingMinor > 0
                      ? ` — owes ${formatMoney(entry.outstandingMinor)}`
                      : " — cleared"}
                  </option>
                ))}
              </Select>
            </Field>

            {student && student.invoices.length > 0 ? (
              <Field
                label="Apply to invoice"
                htmlFor="invoiceId"
                hint="Leave as automatic to settle the oldest debt first."
              >
                <Select
                  id="invoiceId"
                  name="invoiceId"
                  value={invoiceId}
                  onChange={(event) => setInvoiceId(event.target.value)}
                >
                  <option value="">Automatic — oldest invoice first</option>
                  {student.invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNo} — {formatMoney(invoice.balanceMinor)} due{" "}
                      {formatDate(invoice.dueDate)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount received (GH₵)" htmlFor="amount" required>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  className="numeric text-lg"
                  required
                />
              </Field>

              <Field label="Payment method" htmlFor="channel" required>
                <Select
                  id="channel"
                  name="channel"
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as PaymentChannel)}
                >
                  {CHANNELS.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Channel-specific details, so reconciliation has something to
                match against later. */}
            {channel === "MOBILE_MONEY" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Network" htmlFor="momoNetwork">
                  <Select
                    id="momoNetwork"
                    name="momoNetwork"
                    defaultValue={detectMomoNetwork(student?.guardianPhone) ?? "MTN"}
                  >
                    {MOMO_NETWORKS.map((network) => (
                      <option key={network} value={network}>
                        {network}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Mobile money number" htmlFor="momoNumber">
                  <Input
                    id="momoNumber"
                    name="momoNumber"
                    type="tel"
                    inputMode="tel"
                    defaultValue={student?.guardianPhone ?? ""}
                    placeholder="024 123 4567"
                  />
                </Field>
              </div>
            ) : null}

            {channel === "BANK_TRANSFER" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Bank" htmlFor="bankName">
                  <Input id="bankName" name="bankName" placeholder="Ecobank" />
                </Field>
                <Field label="Transfer reference" htmlFor="bankReference">
                  <Input id="bankReference" name="bankReference" placeholder="TRF123456" />
                </Field>
              </div>
            ) : null}

            {channel === "CHEQUE" ? (
              <Field label="Cheque number" htmlFor="chequeNumber">
                <Input id="chequeNumber" name="chequeNumber" placeholder="000123" />
              </Field>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Paid by" htmlFor="payerName" hint="Who handed over the money">
                <Input id="payerName" name="payerName" placeholder="Mr Kwame Mensah" />
              </Field>
              <Field label="Payer phone" htmlFor="payerPhone">
                <Input
                  id="payerPhone"
                  name="payerPhone"
                  type="tel"
                  defaultValue={student?.guardianPhone ?? ""}
                />
              </Field>
            </div>

            <Field label="Narration" htmlFor="narration" hint="Optional note on the receipt">
              <Textarea
                id="narration"
                name="narration"
                rows={2}
                placeholder="First instalment for Term 2"
              />
            </Field>
          </CardBody>
        </Card>

        {/* Live summary */}
        <div className="space-y-4">
          <Card className="lg:sticky lg:top-20">
            <CardHeader title="Summary" />
            <CardBody className="space-y-3 text-sm">
              <Row label="Student" value={student?.label ?? "—"} />
              <Row
                label="Currently owed"
                value={student ? formatMoney(student.outstandingMinor) : "—"}
              />
              <Row
                label="Paying now"
                value={amountMinor > 0 ? formatMoney(amountMinor) : "—"}
                emphasis
              />
              <hr className="border-[var(--border)]" />
              <Row
                label="Balance after"
                value={
                  student && amountMinor > 0
                    ? remaining > 0
                      ? formatMoney(remaining)
                      : remaining === 0
                        ? "Cleared"
                        : `${formatMoney(Math.abs(remaining))} credit`
                    : "—"
                }
                tone={
                  student && amountMinor > 0
                    ? remaining > 0
                      ? "warning"
                      : "success"
                    : undefined
                }
                emphasis
              />

              <SubmitButton />

              <p className="text-xs text-[var(--text-subtle)]">
                A receipt is generated automatically and the guardian is notified in
                their portal.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "success" | "warning";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span
        className={`numeric text-right ${emphasis ? "text-base font-semibold" : ""} ${
          tone === "success"
            ? "text-[var(--success)]"
            : tone === "warning"
              ? "text-[var(--warning)]"
              : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="mt-2 w-full" size="lg" disabled={pending}>
      <Receipt className="size-4" />
      {pending ? "Recording…" : "Record payment"}
    </Button>
  );
}
