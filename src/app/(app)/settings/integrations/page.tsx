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

  const [messaging, finance] = await Promise.all([
    messagingSettings(),
    financeSettings(),
  ]);

  const providers: Provider[] = [
    {
      name: "Payments",
      icon: <CreditCard className="size-4" />,
      configured: env.payments.provider !== "mock",
      active: env.payments.provider,
      detail:
        env.payments.provider === "paystack"
          ? "Mobile money, card, bank transfer and USSD through Paystack."
          : env.payments.provider === "hubtel"
            ? "Mobile money and card through Hubtel."
            : "Simulated checkout. Payments are recorded but no money moves.",
      vars:
        env.payments.provider === "hubtel"
          ? ["HUBTEL_CLIENT_ID", "HUBTEL_CLIENT_SECRET", "HUBTEL_MERCHANT_ACCOUNT"]
          : ["PAYSTACK_SECRET_KEY", "PAYSTACK_PUBLIC_KEY"],
    },
    {
      name: "SMS",
      icon: <MessageSquare className="size-4" />,
      configured: env.sms.provider !== "mock",
      active: env.sms.provider,
      detail:
        env.sms.provider === "mock"
          ? "Messages are logged, not delivered. Costs are still estimated so broadcasts can be rehearsed."
          : `Delivered through ${env.sms.provider}.`,
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
      configured: env.storage.driver !== "local" || env.storage.localDir.startsWith("/"),
      active: env.storage.driver,
      detail:
        env.storage.driver === "local"
          ? `Files are written to ${env.storage.localDir}. Unless that path is a mounted volume, uploads are lost on every redeploy.`
          : `Objects are stored in ${env.storage.s3Bucket || "an unset bucket"}.`,
      vars:
        env.storage.driver === "local"
          ? ["STORAGE_LOCAL_DIR"]
          : ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
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
