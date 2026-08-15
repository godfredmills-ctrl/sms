"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save } from "lucide-react";

import {
  Alert,
  Button,
  CardBody,
  CheckboxField,
  Field,
  Input,
  Textarea,
} from "@/components/ui";

import {
  updateFinanceSettingsAction,
  updateMessagingSettingsAction,
  type FormState,
} from "../actions";

export function MessagingPreferences({
  values,
}: {
  values: {
    senderId: string;
    emailFrom: string;
    replyTo: string;
    signature: string;
    quietHoursStart: string;
    quietHoursEnd: string;
  };
}) {
  const [state, action] = useActionState<FormState, FormData>(
    updateMessagingSettingsAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field
          label="SMS sender ID"
          htmlFor="senderId"
          hint="Up to 11 characters, and registered with your aggregator."
        >
          <Input
            id="senderId"
            name="senderId"
            maxLength={11}
            defaultValue={values.senderId}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email from" htmlFor="emailFrom">
            <Input id="emailFrom" name="emailFrom" defaultValue={values.emailFrom} />
          </Field>
          <Field label="Reply-to" htmlFor="replyTo">
            <Input id="replyTo" name="replyTo" defaultValue={values.replyTo} />
          </Field>
        </div>

        <Field
          label="Email signature"
          htmlFor="signature"
          hint="Appended to outgoing school email."
        >
          <Textarea
            id="signature"
            name="signature"
            rows={2}
            defaultValue={values.signature}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quiet hours from" htmlFor="quietHoursStart">
            <Input
              id="quietHoursStart"
              name="quietHoursStart"
              type="time"
              defaultValue={values.quietHoursStart}
            />
          </Field>
          <Field label="Quiet hours to" htmlFor="quietHoursEnd">
            <Input
              id="quietHoursEnd"
              name="quietHoursEnd"
              type="time"
              defaultValue={values.quietHoursEnd}
            />
          </Field>
        </div>

        <Submit />
      </CardBody>
    </form>
  );
}

export function FinancePreferences({
  values,
}: {
  values: {
    invoicePrefix: string;
    receiptPrefix: string;
    graceDays: number;
    lateFeePercent: number;
    reminderLeadDays: number;
    allowPartPayment: boolean;
  };
}) {
  const [state, action] = useActionState<FormState, FormData>(
    updateFinanceSettingsAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Invoice prefix" htmlFor="invoicePrefix">
            <Input
              id="invoicePrefix"
              name="invoicePrefix"
              defaultValue={values.invoicePrefix}
            />
          </Field>
          <Field label="Receipt prefix" htmlFor="receiptPrefix">
            <Input
              id="receiptPrefix"
              name="receiptPrefix"
              defaultValue={values.receiptPrefix}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Grace days"
            htmlFor="graceDays"
            hint="Before overdue"
          >
            <Input
              id="graceDays"
              name="graceDays"
              type="number"
              min="0"
              defaultValue={values.graceDays}
            />
          </Field>
          <Field label="Late fee %" htmlFor="lateFeePercent">
            <Input
              id="lateFeePercent"
              name="lateFeePercent"
              type="number"
              min="0"
              step="0.5"
              defaultValue={values.lateFeePercent}
            />
          </Field>
          <Field
            label="Remind before"
            htmlFor="reminderLeadDays"
            hint="Days ahead"
          >
            <Input
              id="reminderLeadDays"
              name="reminderLeadDays"
              type="number"
              min="0"
              defaultValue={values.reminderLeadDays}
            />
          </Field>
        </div>

        <CheckboxField
          name="allowPartPayment"
          label="Accept part payments"
          description="Parents can pay any amount towards a bill; the balance is tracked automatically."
          defaultChecked={values.allowPartPayment}
        />

        <Submit />
      </CardBody>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      <Save className="size-4" />
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}
