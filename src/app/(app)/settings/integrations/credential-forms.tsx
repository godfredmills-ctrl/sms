"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  CheckCircle2,
  ExternalLink,
  Info,
  KeyRound,
  Save,
  Send,
  TriangleAlert,
  Wand2,
  XCircle,
} from "lucide-react";

import {
  Alert,
  Button,
  CheckboxField,
  Field,
  Input,
  Select,
} from "@/components/ui";
import {
  fieldsFor,
  type Field as FieldSpec,
  type Integration,
} from "@/lib/integrations/catalogue";

import {
  generateVapidKeysAction,
  saveIntegrationAction,
  sendTestMessageAction,
  testIntegrationAction,
  type IntegrationFormState,
} from "./actions";

export type FieldView = {
  key: string;
  source: "environment" | "database" | "unset";
  display: string;
  unreadable: boolean;
};

function Pending({ label, icon }: { label: string; icon: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {icon}
      {pending ? "Working…" : label}
    </Button>
  );
}

function Outcome({ state }: { state: IntegrationFormState }) {
  if (state.error) return <Alert tone="danger">{state.error}</Alert>;

  if (state.checked) {
    const { ok, detail, inconclusive } = state.checked;
    return (
      <Alert tone={!ok ? "danger" : inconclusive ? "info" : "success"}>
        <span className="flex items-start gap-2">
          {!ok ? (
            <XCircle className="mt-0.5 size-4 shrink-0" />
          ) : inconclusive ? (
            <Info className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{detail}</span>
        </span>
      </Alert>
    );
  }

  if (state.ok && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

/**
 * One field.
 *
 * A value the deployment pins is shown and disabled rather than hidden: an
 * administrator who cannot see why their typing has no effect will type it
 * again, and then telephone somebody. Saying "this is set on the deployment"
 * is the whole answer.
 */
function CredentialField({
  spec,
  view,
}: {
  spec: FieldSpec;
  view: FieldView | undefined;
}) {
  const pinned = view?.source === "environment";
  const hint = [
    spec.help,
    pinned ? "Set by the deployment's environment, which takes precedence over anything typed here." : null,
    view?.unreadable
      ? "Stored, but it cannot be decrypted: the encryption key has changed since it was saved. Paste it again to replace it."
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (spec.kind === "boolean") {
    return (
      <CheckboxField
        name={spec.key}
        label={spec.label}
        description={hint || undefined}
        defaultChecked={(view?.display ?? "").toLowerCase() !== "false"}
        disabled={pinned}
      />
    );
  }

  return (
    <Field
      label={spec.label + (spec.required ? "" : " (optional)")}
      htmlFor={spec.key}
      hint={hint || undefined}
    >
      <Input
        id={spec.key}
        name={spec.key}
        type={spec.kind === "number" ? "number" : "text"}
        // Never `type="password"`: the value in this box is a mask, not a
        // secret, and dotting it out again only stops the administrator
        // checking they pasted the right one.
        autoComplete="off"
        spellCheck={false}
        placeholder={spec.placeholder}
        defaultValue={view?.display ?? ""}
        disabled={pinned}
        className={view?.unreadable ? "border-[var(--danger)]" : undefined}
      />
    </Field>
  );
}

export function IntegrationForm({
  integration,
  provider,
  views,
}: {
  integration: Integration;
  provider: string;
  views: Record<string, FieldView>;
}) {
  const [chosen, setChosen] = useState(provider);
  const [saveState, save] = useActionState<IntegrationFormState, FormData>(
    saveIntegrationAction,
    {},
  );
  const [testState, test] = useActionState<IntegrationFormState, FormData>(
    testIntegrationAction,
    {},
  );

  const providerPinned =
    integration.providerKey && views[integration.providerKey]?.source === "environment";
  const chosenProvider = integration.providers.find((entry) => entry.value === chosen);
  const visible = fieldsFor(integration, chosen);

  const missing = visible.filter(
    (field) => field.required && !(views[field.key]?.display ?? "").trim(),
  );

  return (
    <div className="space-y-3">
      <Outcome state={saveState} />
      <Outcome state={testState} />

      {integration.note ? (
        <p className="rounded-lg bg-[var(--bg-subtle)] p-2.5 text-xs text-[var(--text-muted)]">
          {integration.note}
        </p>
      ) : null}

      <form action={save} className="space-y-3">
        <input type="hidden" name="integration" value={integration.id} />

        {integration.providerKey ? (
          <Field
            label="Provider"
            htmlFor={integration.providerKey}
            // A control that cannot be used must say why, next to itself. A
            // greyed-out box with no explanation reads as a broken page, and
            // the person looking at it tries again and then telephones
            // somebody.
            hint={
              providerPinned
                ? `${integration.providerKey} is set in the deployment's environment variables, which take precedence over this screen. Change it there, or remove it to choose here.`
                : undefined
            }
          >
            <Select
              id={integration.providerKey}
              name={integration.providerKey}
              value={chosen}
              disabled={Boolean(providerPinned)}
              onChange={(event) => setChosen(event.target.value)}
            >
              {integration.providers.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {chosenProvider ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
            <span>{chosenProvider.blurb}</span>
            {chosenProvider.signUp ? (
              <a
                href={chosenProvider.signUp}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 font-medium text-[var(--primary)] hover:underline"
              >
                Where to find these
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </p>
        ) : null}

        {visible.map((spec) => (
          <CredentialField key={spec.key} spec={spec} view={views[spec.key]} />
        ))}

        {missing.length ? (
          <p className="flex items-start gap-2 text-xs text-[var(--warning-text,var(--text-muted))]">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Still needed before anything can be sent:{" "}
              {missing.map((field) => field.label.toLowerCase()).join(", ")}.
            </span>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Pending label="Save" icon={<Save className="size-3.5" />} />
        </div>
      </form>

      <form action={test} className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
        <input type="hidden" name="integration" value={integration.id} />
        <Pending label="Test connection" icon={<KeyRound className="size-3.5" />} />
        <span className="text-xs text-[var(--text-muted)]">
          Contacts the provider now. Costs nothing.
        </span>
      </form>

      {integration.id === "sms" || integration.id === "email" ? (
        <TestMessageForm channel={integration.id} />
      ) : null}

      {integration.id === "push" ? <GenerateKeysForm /> : null}
    </div>
  );
}

/**
 * A real message to a real destination — the only check that proves the last
 * mile, and the only one that spends the school's money, so it never fires
 * without somebody typing where it should go.
 */
function TestMessageForm({ channel }: { channel: "sms" | "email" }) {
  const [state, send] = useActionState<IntegrationFormState, FormData>(
    sendTestMessageAction,
    {},
  );

  return (
    <form action={send} className="space-y-2 border-t border-[var(--border)] pt-3">
      <Outcome state={state} />
      <input type="hidden" name="channel" value={channel} />
      <Field
        label={channel === "sms" ? "Send a test message to" : "Send a test email to"}
        htmlFor={`destination-${channel}`}
        hint={
          channel === "sms"
            ? "One real SMS, charged at your provider's rate. It is the only way to confirm the sender ID is registered."
            : "One real email, so you can see how it arrives and whether it is filed as spam."
        }
      >
        <div className="flex gap-2">
          <Input
            id={`destination-${channel}`}
            name="destination"
            type={channel === "sms" ? "tel" : "email"}
            placeholder={channel === "sms" ? "024 123 4567" : "you@example.com"}
            autoComplete="off"
          />
          <Pending label="Send" icon={<Send className="size-3.5" />} />
        </div>
      </Field>
    </form>
  );
}

function GenerateKeysForm() {
  const [state, generate] = useActionState<IntegrationFormState, FormData>(
    generateVapidKeysAction,
    {},
  );

  return (
    <form action={generate} className="space-y-2 border-t border-[var(--border)] pt-3">
      <Outcome state={state} />
      <div className="flex flex-wrap items-center gap-2">
        <Pending label="Generate a key pair" icon={<Wand2 className="size-3.5" />} />
        <span className="text-xs text-[var(--text-muted)]">
          No account and no sign-up: the keys are made here. Replacing an
          existing pair asks everyone to allow notifications again.
        </span>
      </div>
    </form>
  );
}
