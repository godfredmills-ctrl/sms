import path from "node:path";

import type { Metadata } from "next";
import {
  Bell,
  Bot,
  CheckCircle2,
  CreditCard,
  HardDrive,
  Lock,
  Mail,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import type { ReactNode } from "react";

import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  INTEGRATIONS,
  isKnownProvider,
  providerLabel,
  type IntegrationId,
} from "@/lib/integrations/catalogue";
import { fieldStates, integrationConfig, providerInUse } from "@/lib/integrations/config";
import { hasMasterSecret } from "@/lib/integrations/secrets";
import { financeSettings, messagingSettings } from "@/lib/settings";
import { checkStorage } from "@/lib/storage";

import { IntegrationForm, type FieldView } from "./credential-forms";
import { FinancePreferences, MessagingPreferences } from "./preference-forms";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

const ICONS: Record<IntegrationId, ReactNode> = {
  payments: <CreditCard className="size-4" />,
  sms: <MessageSquare className="size-4" />,
  email: <Mail className="size-4" />,
  push: <Bell className="size-4" />,
  ai: <Bot className="size-4" />,
  storage: <HardDrive className="size-4" />,
};

export default async function IntegrationsPage() {
  await requirePermission("settings.integration.manage");

  const [messaging, finance, storage, config, states] = await Promise.all([
    messagingSettings(),
    financeSettings(),
    checkStorage(),
    integrationConfig(),
    fieldStates(),
  ]);

  // Which provider each one dispatches through, from the resolver — the same
  // answer the sender gets. A second mapping written here is how this page
  // once reported a provider live while nothing was being delivered.
  const active = Object.fromEntries(
    INTEGRATIONS.map((integration) => [
      integration.id,
      providerInUse(config, integration.id),
    ]),
  ) as Record<IntegrationId, string>;

  const cards = INTEGRATIONS.map((integration) => {
    const provider = active[integration.id];
    const known = isKnownProvider(integration, provider);

    // "Configured" means every required field for the chosen provider is
    // present — not that some variable somewhere is non-empty. A provider name
    // the dispatcher does not recognise is never configured, whatever else is
    // filled in.
    const required = integration.fields.filter(
      (field) =>
        field.required && (!field.onlyFor || field.onlyFor.includes(provider)),
    );
    const missing = required.filter(
      (field) => !(states.get(field.key)?.display ?? "").trim(),
    );

    const usingFallback =
      provider === "mock" ||
      (integration.id === "push" && !config.push.enabled) ||
      (integration.id === "ai" && !config.ai.enabled);

    // Storage is the one integration whose health was actually measured rather
    // than inferred from which fields are filled in — a bucket whose token was
    // revoked has every variable present and works for nothing.
    //
    // A relative local directory is reachable and still not a setup a school
    // should be running on: it lives inside the container, so every uploaded
    // photograph and consent form is destroyed by the next redeploy. Reachable
    // is not the same as sound, and the badge answers the second question.
    const verified = integration.id === "storage" ? storage : null;
    const soundStorage =
      verified?.ok &&
      (env.storage.driver === "s3" || path.isAbsolute(env.storage.localDir));

    return {
      integration,
      provider,
      known,
      missing,
      usingFallback,
      detail: verified?.detail ?? null,
      configured: verified
        ? Boolean(soundStorage)
        : known && missing.length === 0 && !usingFallback,
    };
  });

  const stillOnFallback = cards.filter((card) => card.usingFallback || !card.known);
  const unreadable = config.unreadable;

  return (
    <>
      <PageHeader
        title="Integrations"
        description="What this deployment can actually send, take payment through and store: and what it still needs before it can."
      />

      {unreadable.length ? (
        <Alert tone="danger" className="mb-4">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>
                {unreadable.length} stored credential
                {unreadable.length === 1 ? "" : "s"} cannot be decrypted.
              </strong>{" "}
              {unreadable.join(", ")}. This happens when SESSION_SECRET (or
              CREDENTIALS_KEY, if set) has changed since they were saved. They are
              not being used and nothing is falling back to them silently: paste
              each one in again to replace it.
            </span>
          </span>
        </Alert>
      ) : null}

      {!hasMasterSecret() ? (
        <Alert tone="warning" className="mb-4">
          <span className="flex items-start gap-2">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <span>
              SESSION_SECRET is still the development placeholder, so anything
              saved here is encrypted with a key that is published in the source.
              Set a real SESSION_SECRET: or a separate CREDENTIALS_KEY: before
              entering a live credential.
            </span>
          </span>
        </Alert>
      ) : null}

      <Alert tone="info" className="mb-4">
        <span className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Where credentials are kept.</strong> A credential set in the
            deployment&rsquo;s environment variables wins and is shown here
            read-only, with a note saying so. Everything else is set here:
            encrypted before it is stored, with a key held in the environment and
            never in the database, so a database backup contains ciphertext.
            Secrets are never shown back in full, only enough of one to tell it
            from another. Naming the built-in fallback in the
            environment&nbsp;- <code>mock</code>, <code>local</code>&nbsp;- does
            not pin anything, because that means &ldquo;not set up yet&rdquo;
            rather than a choice.
          </span>
        </span>
      </Alert>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ integration, provider, known, missing, usingFallback, configured, detail }) => (
          <Card key={integration.id}>
            <CardBody>
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                    {ICONS[integration.id]}
                  </span>
                  {integration.name}
                </span>
                <Badge tone={configured ? "success" : known ? "warning" : "danger"}>
                  {configured ? (
                    <>
                      <CheckCircle2 className="size-2.5" />
                      Live
                    </>
                  ) : known ? (
                    "Not configured"
                  ) : (
                    "Misconfigured"
                  )}
                </Badge>
              </div>

              <p className="text-xs text-[var(--text-muted)]">
                {detail
                  ? detail
                  : !known
                  ? `"${provider}" is not a provider this system knows how to dispatch through. Nothing will be sent until it is corrected.`
                  : missing.length
                    ? `Missing ${missing.map((field) => field.label.toLowerCase()).join(", ")}.`
                    : usingFallback
                      ? integration.providers.find((entry) => entry.value === provider)
                          ?.blurb ?? integration.blurb
                      : integration.blurb}
              </p>

              <p className="mt-2 text-[11px] text-[var(--text-subtle)]">
                Using:{" "}
                <span className="font-medium">
                  {integration.providers.length
                    ? providerLabel(integration, provider)
                    : provider}
                </span>
              </p>
            </CardBody>
          </Card>
        ))}
      </div>

      {stillOnFallback.length ? (
        <Alert tone="warning" className="mb-6">
          {stillOnFallback.length} integration
          {stillOnFallback.length === 1 ? " is" : "s are"} still on the built-in
          fallback:{" "}
          {stillOnFallback.map(({ integration }) => integration.name).join(", ")}.
          The system works without them: messages are logged and payments
          simulated, so the whole term can be rehearsed: but nothing reaches a
          parent until they are set up below.
        </Alert>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {INTEGRATIONS.map((integration) => {
          const views: Record<string, FieldView> = {};
          for (const field of integration.fields) {
            const state = states.get(field.key);
            if (state) {
              views[field.key] = {
                key: state.key,
                source: state.source,
                display: state.display,
                unreadable: state.unreadable,
              };
            }
          }
          if (integration.providerKey) {
            const state = states.get(integration.providerKey);
            if (state) {
              views[integration.providerKey] = {
                key: state.key,
                source: state.source,
                display: state.display,
                unreadable: state.unreadable,
              };
            }
          }

          return (
            <Card key={integration.id}>
              <CardHeader
                title={integration.name}
                description={integration.blurb}
              />
              <CardBody>
                {integration.envOnly ? (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--text-muted)]">
                      {integration.envOnlyReason}
                    </p>
                    <p className="text-xs">
                      <span className="text-[var(--text-subtle)]">Currently:</span>{" "}
                      <span className="font-medium">{storage.detail}</span>
                    </p>
                    <p className="font-mono text-[10px] break-all text-[var(--text-subtle)]">
                      {integration.fields
                        .filter(
                          (field) =>
                            !field.onlyFor ||
                            field.onlyFor.includes(env.storage.driver),
                        )
                        .map((field) => field.key)
                        .join(" · ")}
                    </p>
                  </div>
                ) : (
                  <IntegrationForm
                    integration={integration}
                    provider={active[integration.id]}
                    views={views}
                  />
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Messaging preferences"
            description="Applied to every announcement, reminder and bulk send."
          />
          <MessagingPreferences values={messaging} />
        </Card>

        <Card>
          <CardHeader
            title="Billing preferences"
            description="Numbering, grace periods and how reminders are timed."
          />
          <FinancePreferences values={finance} />
        </Card>
      </div>
    </>
  );
}
