"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Mail, MessageSquare, Send, Smartphone, Users } from "lucide-react";
import type { MessageChannel } from "@prisma/client";

import { SearchableSelect } from "@/components/select-search";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  Field,
  Input,
  Textarea,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

import {
  previewAudienceAction,
  sendMessageAction,
  type AudiencePreview,
  type SendState,
} from "../actions";

const CHANNELS: Array<{
  value: MessageChannel;
  label: string;
  hint: string;
  icon: typeof Mail;
}> = [
  { value: "SMS", label: "SMS", hint: "Charged per segment", icon: Smartphone },
  { value: "EMAIL", label: "Email", hint: "Free", icon: Mail },
  { value: "PUSH", label: "Push", hint: "App users only", icon: MessageSquare },
  { value: "IN_APP", label: "In-app", hint: "Portal inbox", icon: Users },
];

const TEMPLATE_TOKENS = [
  "{{student.fullName}}",
  "{{student.class}}",
  "{{guardian.firstName}}",
  "{{invoice.balance}}",
  "{{school.name}}",
];

export function ComposeForm({
  classes,
  templates,
}: {
  classes: Array<{ value: string; label: string; description?: string }>;
  templates: Array<{ id: string; name: string; subject: string | null; body: string; smsBody: string | null }>;
}) {
  const [state, action] = useActionState<SendState, FormData>(sendMessageAction, {});

  const [channel, setChannel] = useState<MessageChannel>("SMS");
  const [audiences, setAudiences] = useState<string[]>(["GUARDIAN"]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [billPayersOnly, setBillPayersOnly] = useState(false);
  const [withBalance, setWithBalance] = useState(false);
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [checking, startCheck] = useTransition();

  // Recount whenever the targeting or the message changes — the cost of an
  // SMS blast depends on both, and it must be visible before sending.
  useEffect(() => {
    const timer = setTimeout(() => {
      startCheck(async () => {
        const result = await previewAudienceAction(
          {
            portals: audiences as ("STAFF" | "STUDENT" | "GUARDIAN")[],
            classSectionIds: classIds.length ? classIds : undefined,
            billPayersOnly,
            withOutstandingBalance: withBalance,
          },
          channel,
          body,
        );
        setPreview(result);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [audiences, classIds, billPayersOnly, withBalance, channel, body]);

  if (state.ok) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
            <CheckCircle2 className="size-6" />
          </span>
          <h2 className="text-lg font-semibold">Message sent</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {state.sent} delivered
            {state.failed ? `, ${state.failed} failed` : ""}
            {state.costMinor ? ` · ${formatMoney(state.costMinor)}` : ""}.
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Send another
          </Button>
        </CardBody>
      </Card>
    );
  }

  const overLimit = channel === "SMS" && body.length > 480;

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[1fr_320px]">
      {/* Hidden fields carry the composed audience into the action. */}
      {audiences.map((portal) => (
        <input key={portal} type="hidden" name="portals" value={portal} />
      ))}
      <input type="hidden" name="classSectionIds" value={classIds.join(",")} />
      <input type="hidden" name="channel" value={channel} />

      <div className="space-y-4">
        <Card>
          <CardHeader title="Message" />
          <CardBody className="space-y-4">
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                Channel
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CHANNELS.map((entry) => {
                  const Icon = entry.icon;
                  const isActive = channel === entry.value;
                  return (
                    <button
                      key={entry.value}
                      type="button"
                      onClick={() => setChannel(entry.value)}
                      aria-pressed={isActive}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors",
                        isActive
                          ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                          : "border-[var(--border)] hover:bg-[var(--bg-subtle)]",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-5",
                          isActive ? "text-[var(--primary)]" : "text-[var(--text-subtle)]",
                        )}
                      />
                      <span className="text-xs font-medium">{entry.label}</span>
                      <span className="text-[10px] text-[var(--text-subtle)]">
                        {entry.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <Field label="Internal name" htmlFor="title" required hint="Shown in the send log.">
              <Input id="title" name="title" required placeholder="Term 2 fee reminder" />
            </Field>

            {channel !== "SMS" ? (
              <Field label="Subject" htmlFor="subject">
                <Input id="subject" name="subject" placeholder="School Fees Reminder" />
              </Field>
            ) : null}

            {templates.length ? (
              <Field label="Start from a template" htmlFor="template">
                <SearchableSelect
                  id="template"
                  placeholder="Write from scratch"
                  options={templates.map((template) => ({
                    value: template.id,
                    label: template.name,
                  }))}
                  onChange={(next) => {
                    const template = templates.find((entry) => entry.id === next);
                    if (!template) return;
                    setBody(
                      channel === "SMS" ? (template.smsBody ?? template.body) : template.body,
                    );
                  }}
                />
              </Field>
            ) : null}

            <Field
              label="Message"
              htmlFor="body"
              required
              error={overLimit ? "This is over 3 SMS segments per person." : undefined}
              hint={
                channel === "SMS"
                  ? `${body.length} characters · ${Math.max(1, Math.ceil(body.length / 153))} segment(s) per recipient`
                  : undefined
              }
            >
              <Textarea
                id="body"
                name="body"
                required
                rows={channel === "SMS" ? 4 : 8}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Dear Parent, …"
              />
            </Field>

            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => setBody((current) => `${current}${token}`)}
                  className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                >
                  {token}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Audience" description="Who this goes to." />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["GUARDIAN", "STUDENT", "STAFF"] as const).map((portal) => (
                <button
                  key={portal}
                  type="button"
                  onClick={() =>
                    setAudiences((current) =>
                      current.includes(portal)
                        ? current.filter((entry) => entry !== portal)
                        : [...current, portal],
                    )
                  }
                  aria-pressed={audiences.includes(portal)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    audiences.includes(portal)
                      ? "border-transparent bg-[var(--primary)] text-[var(--primary-text)]"
                      : "border-[var(--border-strong)] text-[var(--text-muted)]",
                  )}
                >
                  {portal === "GUARDIAN"
                    ? "Parents"
                    : portal === "STUDENT"
                      ? "Students"
                      : "Staff"}
                </button>
              ))}
            </div>

            <Field label="Limit to classes" hint="Leave empty for the whole school.">
              <SearchableSelect
                multiple
                placeholder="All classes"
                options={classes}
                value={classIds}
                onChange={(next) => setClassIds(next as string[])}
              />
            </Field>

            <CheckboxField
              name="billPayersOnly"
              label="Bill payers only"
              description="Guardians marked as responsible for fees."
              checked={billPayersOnly}
              onChange={(event) => setBillPayersOnly(event.target.checked)}
            />
            <CheckboxField
              name="withBalance"
              label="Only those with an outstanding balance"
              description="Use for fee chasing so families who have paid are not messaged."
              checked={withBalance}
              onChange={(event) => setWithBalance(event.target.checked)}
            />
          </CardBody>
        </Card>
      </div>

      {/* Live audience and cost */}
      <div>
        <Card className="lg:sticky lg:top-20">
          <CardHeader title="Before you send" />
          <CardBody className="space-y-3 text-sm">
            <Row label="Matched" value={preview ? String(preview.recipients) : "—"} />
            <Row
              label="Reachable"
              value={preview ? String(preview.reachable) : "—"}
              tone={
                preview && preview.reachable < preview.recipients ? "warning" : undefined
              }
            />
            {channel === "SMS" ? (
              <>
                <Row label="Segments" value={preview ? String(preview.segments) : "—"} />
                <Row
                  label="Estimated cost"
                  value={preview ? formatMoney(preview.costMinor) : "—"}
                  emphasis
                />
              </>
            ) : null}

            {preview && preview.reachable < preview.recipients ? (
              <p className="text-xs text-[var(--warning)]">
                {preview.recipients - preview.reachable} contact
                {preview.recipients - preview.reachable === 1 ? " has" : "s have"} no{" "}
                {channel === "EMAIL" ? "email address" : "phone number"} on file and
                will be skipped.
              </p>
            ) : null}

            {preview?.sample.length ? (
              <div>
                <p className="text-xs text-[var(--text-subtle)]">For example:</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {preview.sample.map((name) => (
                    <Badge key={name} tone="neutral">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <SubmitButton
              disabled={!preview?.reachable || overLimit}
              checking={checking}
              count={preview?.reachable ?? 0}
            />

            <p className="text-xs text-[var(--text-subtle)]">
              Delivery is recorded per person, so failures can be found afterwards.
            </p>
          </CardBody>
        </Card>
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
  tone?: "warning";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span
        className={cn(
          "numeric",
          emphasis && "text-base font-semibold",
          tone === "warning" && "text-[var(--warning)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SubmitButton({
  disabled,
  checking,
  count,
}: {
  disabled: boolean;
  checking: boolean;
  count: number;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="mt-1 w-full" disabled={disabled || pending}>
      <Send className="size-4" />
      {pending
        ? "Sending…"
        : checking
          ? "Counting…"
          : count
            ? `Send to ${count}`
            : "Nobody to send to"}
    </Button>
  );
}
