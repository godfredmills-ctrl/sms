"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { BellRing } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import { Alert, Button, CardBody, Field, Input } from "@/components/ui";
import { REMINDER_AUDIENCES } from "@/lib/audiences";

import { saveReminderRuleAction, type FinanceFormState } from "../actions";

export function RuleForm() {
  const [state, action] = useActionState<FinanceFormState, FormData>(
    saveReminderRuleAction,
    {},
  );
  const [trigger, setTrigger] = useState("BEFORE_DUE");
  const needsOffset = trigger === "BEFORE_DUE" || trigger === "AFTER_DUE";

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Rule name" htmlFor="name" required>
          <Input id="name" name="name" required placeholder="One week before due" />
        </Field>

        <Field label="Fires" htmlFor="trigger" required>
          <SearchableSelect
            id="trigger"
            name="trigger"
            clearable={false}
            value={trigger}
            onChange={(value) => setTrigger(value as string)}
            options={[
              { value: "BEFORE_DUE", label: "Before the due date" },
              { value: "ON_DUE", label: "On the due date" },
              { value: "AFTER_DUE", label: "After the due date" },
              {
                value: "BALANCE_OUTSTANDING",
                label: "While any balance is outstanding",
              },
            ]}
          />
        </Field>

        {needsOffset ? (
          <Field label="Days" htmlFor="offsetDays" hint="How many days before or after">
            <Input
              id="offsetDays"
              name="offsetDays"
              type="number"
              min="0"
              defaultValue={7}
            />
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Repeat every"
            htmlFor="repeatEveryDays"
            hint="Days. 0 sends once."
          >
            <Input
              id="repeatEveryDays"
              name="repeatEveryDays"
              type="number"
              min="0"
              defaultValue={0}
            />
          </Field>
          <Field label="Maximum sends" htmlFor="maxReminders">
            <Input
              id="maxReminders"
              name="maxReminders"
              type="number"
              min="1"
              defaultValue={3}
            />
          </Field>
        </div>

        <Field
          label="Only when the balance exceeds"
          htmlFor="minBalance"
          hint="GH₵. Stops chasing trivial amounts."
        >
          <Input id="minBalance" name="minBalance" inputMode="decimal" defaultValue="0" />
        </Field>

        <Field label="Channels" htmlFor="channels" required>
          <SearchableSelect
            id="channels"
            name="channels"
            multiple
            defaultValue={["SMS", "PUSH"]}
            options={[
              { value: "SMS", label: "SMS" },
              { value: "EMAIL", label: "Email" },
              { value: "PUSH", label: "Push notification" },
              { value: "IN_APP", label: "In-app notification" },
              { value: "WHATSAPP", label: "WhatsApp" },
            ]}
          />
        </Field>

        <Field label="Audience" htmlFor="audience">
          {/* Options come from the same table the reminder engine resolves
              against, so the two cannot drift apart again. */}
          <SearchableSelect
            id="audience"
            name="audience"
            clearable={false}
            defaultValue="BILL_PAYERS"
            options={REMINDER_AUDIENCES.map((entry) => ({
              value: entry.value,
              label: entry.label,
              description: entry.description,
            }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Not before" htmlFor="sendAfterHour" hint="24-hour clock">
            <Input
              id="sendAfterHour"
              name="sendAfterHour"
              type="number"
              min="0"
              max="23"
              defaultValue={7}
            />
          </Field>
          <Field label="Not after" htmlFor="sendBeforeHour">
            <Input
              id="sendBeforeHour"
              name="sendBeforeHour"
              type="number"
              min="1"
              max="24"
              defaultValue={20}
            />
          </Field>
        </div>

        <Submit />
      </CardBody>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      <BellRing className="size-4" />
      {pending ? "Saving…" : "Create rule"}
    </Button>
  );
}
