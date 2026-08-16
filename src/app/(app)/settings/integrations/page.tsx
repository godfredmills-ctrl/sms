import type { Metadata } from "next";
import {
  Bell,
  Bot,
  CheckCircle2,
  CreditCard,
  HardDrive,
  Mail,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import type { ReactNode } from "react";

import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import { financeSettings, messagingSettings } from "@/lib/settings";
import { checkStorage } from "@/lib/storage";

import { FinancePreferences, MessagingPreferences } from "./preference-forms";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

type Provider = {
  name: string;
  icon: ReactNode;
  configured: boolean;
  active: string;
  detail: string;
  /** Environment variables this provider reads. */
  vars: string[];
};

export default async function IntegrationsPage() {
  await requirePermission("settings.integration.manage");

  const [messaging, finance, storage] = await Promise.all([
    messagingSettings(),
    financeSettings(),
    // Storage is the one integration that can be verified without sending
    // anything, so it is checked for real rather than inferred from whether
    // the variables happen to be present.
    checkStorage(),
  ]);

  // "Not mock" is not the same as "recognised". These cards used to report a
  // provider as live whenever the name was anything other than "mock", while
  // the code that dispatches switches on a fixed list — so a typo in
  // SMS_PROVIDER produced a green badge here and nothing delivered anywhere.
  // The card now answers the question the dispatcher answers.
  const KNOWN_PAYMENT = ["paystack", "hubtel"];
  const KNOWN_SMS = ["arkesel", "mnotify", "hubtel"];

  const paymentKnown = KNOWN_PAYMENT.includes(env.payments.provider);
  const smsKnown = KNOWN_SMS.includes(env.sms.provider);

  const unknown = (name: string, value: string, known: string[]) =>
    `"${value}" is not a ${name} provider this system knows. Expected one of ${known.join(", ")} or mock. Nothing will be sent until this is corrected.`;

  const providers: Provider[] = [
    {
      name: "Payments",
      icon: <CreditCard className="size-4" />,
      configured: paymentKnown,
      active: env.payments.provider,
      detail:
        env.payments.provider === "paystack"
          ? "Mobile money, card, bank transfer and USSD through Paystack."
          : env.payments.provider === "hubtel"
            ? "Mobile money and card through Hubtel."
            : env.payments.provider === "mock"
              ? "Simulated checkout. Payments are recorded but no money moves."
              : unknown("payment", env.payments.provider, KNOWN_PAYMENT),
      vars:
        env.payments.provider === "hubtel"
          ? ["HUBTEL_CLIENT_ID", "HUBTEL_CLIENT_SECRET", "HUBTEL_MERCHANT_ACCOUNT"]
          : ["PAYSTACK_SECRET_KEY", "PAYSTACK_PUBLIC_KEY"],
    },
    {
      name: "SMS",
      icon: <MessageSquare className="size-4" />,
      configured: smsKnown,
      active: env.sms.provider,
      detail:
        env.sms.provider === "mock"
          ? "Messages are logged, not delivered. Costs are still estimated so broadcasts can be rehearsed."
          : smsKnown
            ? `Delivered through ${env.sms.provider}.`
            : unknown("SMS", env.sms.provider, KNOWN_SMS),
      vars:
        env.sms.provider === "arkesel"
          ? ["ARKESEL_API_KEY"]
          : env.sms.provider === "mnotify"
            ? ["MNOTIFY_API_KEY"]
            : ["HUBTEL_SMS_CLIENT_ID", "HUBTEL_SMS_CLIENT_SECRET"],
    },
    {
      name: "Email",
      icon: <Mail className="size-4" />,
      configured: env.email.provider === "smtp" && Boolean(env.email.host),
      active: env.email.provider,
      detail:
        env.email.provider === "smtp"
          ? `SMTP via ${env.email.host || "an unset host"}.`
          : "Email is logged to the server console only.",
      vars: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"],
    },
    {
      name: "Push notifications",
      icon: <Bell className="size-4" />,
      configured: env.push.enabled,
      active: env.push.enabled ? "web-push" : "off",
      detail: env.push.enabled
        ? "Browsers and installed PWAs receive push notifications."
        : "Generate a VAPID key pair to enable push on the installed app.",
      vars: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
    },
    {
      name: "AI insights",
      icon: <Bot className="size-4" />,
      configured: env.ai.enabled,
      active: env.ai.enabled ? env.ai.model : "off",
      detail: env.ai.enabled
        ? "Report commentary, teaching insights and custom report narratives are available."
        : "Set an Anthropic API key to turn on AI insights across the system.",
      vars: ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "AI_ENABLED"],
    },
    {
      name: "File storage",
      icon: <HardDrive className="size-4" />,
      // Verified, not assumed: a bucket whose credentials were revoked looks
      // perfectly configured from the environment alone.
      configured: storage.ok && (storage.driver === "s3" || env.storage.localDir.startsWith("/")),
      active: env.storage.driver,
      detail: storage.detail,
      vars:
        env.storage.driver === "local"
          ? ["STORAGE_DRIVER", "STORAGE_LOCAL_DIR"]
          : [
              "STORAGE_DRIVER",
              "S3_ENDPOINT",
              "S3_BUCKET",
              "S3_REGION",
              "S3_ACCESS_KEY_ID",
              "S3_SECRET_ACCESS_KEY",
            ],
    },
  ];

  const unconfigured = providers.filter((provider) => !provider.configured);

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Which providers this deployment is wired to, and the preferences the school controls."
      />

      <Alert tone="info" className="mb-4">
        <span className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Credentials are never stored here.</strong> API keys live in the
            deployment&rsquo;s environment variables, where they stay out of the
            database and out of backups. This page reports what is configured;
            changing a key means changing it on the host and redeploying.
          </span>
        </span>
      </Alert>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => (
          <Card key={provider.name}>
            <CardBody>
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                    {provider.icon}
                  </span>
                  {provider.name}
                </span>
                <Badge tone={provider.configured ? "success" : "warning"}>
                  {provider.configured ? (
                    <>
                      <CheckCircle2 className="size-2.5" />
                      Live
                    </>
                  ) : (
                    "Not configured"
                  )}
                </Badge>
              </div>
              <p className="text-xs text-[var(--text-muted)]">{provider.detail}</p>
              <p className="mt-2 text-[11px] text-[var(--text-subtle)]">
                Provider: <span className="font-medium">{provider.active}</span>
              </p>
              <p className="mt-1 font-mono text-[10px] break-all text-[var(--text-subtle)]">
                {provider.vars.join(" · ")}
              </p>
            </CardBody>
          </Card>
        ))}
      </div>

      {unconfigured.length ? (
        <Alert tone="warning" className="mb-4">
          {unconfigured.length} integration{unconfigured.length === 1 ? " is" : "s are"}{" "}
          still on the built-in fallback:{" "}
          {unconfigured.map((provider) => provider.name).join(", ")}. The system works
          without them — messages are logged and payments simulated — but nothing
          reaches a parent until the credentials are set.
        </Alert>
      ) : null}

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
