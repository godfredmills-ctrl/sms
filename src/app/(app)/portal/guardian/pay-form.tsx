"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Building2, CreditCard, Hash, Smartphone } from "lucide-react";
import type { PaymentChannel } from "@prisma/client";

import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

import { startCheckout, type CheckoutState } from "./actions";

export type PayableChild = {
  id: string;
  name: string;
  className: string;
  outstandingMinor: number;
};

const CHANNEL_UI: Record<
  string,
  { label: string; hint: string; icon: typeof Smartphone }
> = {
  MOBILE_MONEY: {
    label: "Mobile Money",
    hint: "MTN, Telecel or AirtelTigo",
    icon: Smartphone,
  },
  CARD: { label: "Card", hint: "Visa or Mastercard", icon: CreditCard },
  BANK_TRANSFER: { label: "Bank Transfer", hint: "Pay from your bank", icon: Building2 },
  USSD: { label: "USSD", hint: "Dial a short code", icon: Hash },
};

/**
 * Guardian-facing payment form.
 *
 * Part payment is the default expectation, not an exception: the amount is
 * editable and pre-filled with the full balance, with quick options for a
 * half or a third of it.
 */
export function PayForm({
  wards,
  availableChannels,
  liveGateway,
}: {
  /** Named `wards` rather than `children` — `children` is a reserved JSX prop. */
  wards: PayableChild[];
  availableChannels: PaymentChannel[];
  liveGateway: boolean;
}) {
  const [state, action] = useActionState<CheckoutState, FormData>(startCheckout, {});
  const [studentId, setStudentId] = useState(wards[0]?.id ?? "");
  const [channel, setChannel] = useState<PaymentChannel>(
    availableChannels[0] ?? "MOBILE_MONEY",
  );
  const [amount, setAmount] = useState(() =>
    wards[0] ? (wards[0].outstandingMinor / 100).toFixed(2) : "",
  );

  const ward = useMemo(
    () => wards.find((entry) => entry.id === studentId),
    [wards, studentId],
  );

  function setPortion(fraction: number) {
    if (!ward) return;
    setAmount(((ward.outstandingMinor * fraction) / 100).toFixed(2));
  }

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {!liveGateway ? (
        <Alert tone="info">
          A test payment gateway is active. Payments will be simulated, not charged.
        </Alert>
      ) : null}

      {wards.length > 1 ? (
        <Field label="Paying for" htmlFor="studentId" required>
          <Select
            id="studentId"
            name="studentId"
            value={studentId}
            onChange={(event) => {
              setStudentId(event.target.value);
              const next = wards.find((entry) => entry.id === event.target.value);
              if (next) setAmount((next.outstandingMinor / 100).toFixed(2));
            }}
          >
            {wards.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} ({entry.className}) — {formatMoney(entry.outstandingMinor)}{" "}
                outstanding
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="studentId" value={studentId} />
      )}

      <Field
        label="Amount to pay (GH₵)"
        htmlFor="amount"
        hint={
          ward
            ? `Outstanding balance: ${formatMoney(ward.outstandingMinor)}. You may pay part of it.`
            : undefined
        }
        required
      >
        <Input
          id="amount"
          name="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="numeric text-lg"
          required
        />
      </Field>

      {ward && ward.outstandingMinor > 0 ? (
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Pay in full", fraction: 1 },
            { label: "Pay half", fraction: 0.5 },
            { label: "Pay a third", fraction: 1 / 3 },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setPortion(option.fraction)}
              className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)]"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <fieldset>
        <legend className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
          How would you like to pay?
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {availableChannels.map((option) => {
            const ui = CHANNEL_UI[option];
            if (!ui) return null;
            const Icon = ui.icon;
            const isActive = channel === option;
            return (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors",
                  isActive
                    ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                    : "border-[var(--border)] hover:bg-[var(--bg-subtle)]",
                )}
              >
                <input
                  type="radio"
                  name="channel"
                  value={option}
                  checked={isActive}
                  onChange={() => setChannel(option)}
                  className="sr-only"
                />
                <Icon
                  className={cn(
                    "size-5",
                    isActive ? "text-[var(--primary)]" : "text-[var(--text-subtle)]",
                  )}
                />
                <span
                  className={cn("text-xs font-medium", isActive && "text-[var(--primary)]")}
                >
                  {ui.label}
                </span>
                <span className="text-[10px] text-[var(--text-subtle)]">{ui.hint}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <SubmitButton amount={amount} />

      <p className="text-xs text-[var(--text-subtle)]">
        You will be taken to a secure payment page. A receipt is issued automatically
        once the payment is confirmed.
      </p>
    </form>
  );
}

function SubmitButton({ amount }: { amount: string }) {
  const { pending } = useFormStatus();
  const parsed = Number.parseFloat(amount || "0");

  return (
    <Button
      type="submit"
      size="lg"
      className="w-full"
      disabled={pending || !Number.isFinite(parsed) || parsed <= 0}
    >
      {pending
        ? "Opening secure checkout…"
        : parsed > 0
          ? `Pay ${formatMoney(Math.round(parsed * 100))}`
          : "Pay now"}
    </Button>
  );
}
