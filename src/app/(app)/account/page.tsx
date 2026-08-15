import type { Metadata } from "next";
import { Bell, Check, Monitor, ShieldCheck, X } from "lucide-react";

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  PageHeader,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, fullName, humanise, relativeTime } from "@/lib/utils";

import { revokeOwnSessionAction, updateNotificationPreferenceAction } from "./actions";
import { PasswordForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "My account" };
export const dynamic = "force-dynamic";

const CATEGORIES = [
  { key: "FEE", label: "Fees and payments" },
  { key: "ATTENDANCE", label: "Attendance" },
  { key: "RESULT", label: "Results" },
  { key: "ANNOUNCEMENT", label: "Announcements" },
  { key: "MEMO", label: "Memos" },
  { key: "ELECTION", label: "Elections" },
  { key: "SYSTEM", label: "System" },
];

const CHANNELS = [
  { key: "IN_APP", label: "In app" },
  { key: "PUSH", label: "Push" },
  { key: "EMAIL", label: "Email" },
  { key: "SMS", label: "SMS" },
];

export default async function AccountPage() {
  const user = await requireUser();
  const now = new Date();

  const [account, sessions, preferences] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        firstName: true,
        lastName: true,
        otherNames: true,
        email: true,
        phone: true,
        username: true,
        avatarUrl: true,
        portal: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        mustChangePassword: true,
        roles: { select: { role: { select: { name: true, key: true } } } },
      },
    }),
    db.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastActiveAt: "desc" },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        lastActiveAt: true,
        createdAt: true,
        expiresAt: true,
      },
    }),
    db.notificationPreference.findMany({
      where: { userId: user.id },
      select: { category: true, channel: true, enabled: true },
    }),
  ]);

  if (!account) return null;

  // Absent means enabled: a school should not have to opt every parent in to
  // fee reminders one row at a time before the system will send anything.
  const disabled = new Set(
    preferences
      .filter((preference) => !preference.enabled)
      .map((preference) => `${preference.category}:${preference.channel}`),
  );

  return (
    <>
      <PageHeader
        title="My account"
        description="Your profile, password, devices and what the system may send you."
      />

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Avatar name={fullName(account)} src={account.avatarUrl} size={64} />
        <div>
          <p className="text-lg font-semibold">{fullName(account)}</p>
          <p className="text-sm text-[var(--text-muted)]">
            {account.email ?? account.phone ?? account.username}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone="info">{account.portal}</Badge>
            {account.roles.map((link) => (
              <Badge key={link.role.key} tone="violet">
                {link.role.name}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <ProfileForm
            values={{
              firstName: account.firstName,
              lastName: account.lastName,
              otherNames: account.otherNames ?? "",
              email: account.email ?? "",
              phone: account.phone ?? "",
              avatarUrl: account.avatarUrl ?? "",
            }}
          />
        </Card>

        <Card>
          <CardHeader
            title="Password"
            description="Changing it ends every other session."
          />
          <PasswordForm mustChange={account.mustChangePassword} />
        </Card>

        <Card>
          <CardHeader
            title="Signed-in devices"
            description="Anything you do not recognise should be ended immediately."
          />
          {sessions.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm">
                      <Monitor className="size-3.5 text-[var(--text-subtle)]" />
                      {session.userAgent
                        ? session.userAgent.slice(0, 60)
                        : "Unknown device"}
                    </p>
                    <p className="text-xs text-[var(--text-subtle)]">
                      {session.ipAddress ?? "no IP recorded"} · active{" "}
                      {relativeTime(session.lastActiveAt)} · expires{" "}
                      {formatDateTime(session.expiresAt)}
                    </p>
                  </div>
                  <form action={revokeOwnSessionAction}>
                    <input type="hidden" name="id" value={session.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      <X className="size-3.5" />
                      End
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-sm text-[var(--text-muted)]">No active sessions.</p>
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Account details" />
          <CardBody>
            <DescriptionList
              items={[
                { label: "Username", value: account.username ?? "—" },
                { label: "Status", value: humanise(account.status) },
                {
                  label: "Last signed in",
                  value: account.lastLoginAt
                    ? formatDateTime(account.lastLoginAt)
                    : "Never",
                },
                { label: "Account created", value: formatDateTime(account.createdAt) },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Notification preferences"
          description="Turn a channel off for a category and the system stops using it for you."
          action={<Bell className="size-4 text-[var(--text-subtle)]" />}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-5 py-2 font-medium">Category</th>
                {CHANNELS.map((channel) => (
                  <th key={channel.key} className="px-3 py-2 text-center font-medium">
                    {channel.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((category) => (
                <tr
                  key={category.key}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-5 py-2">{category.label}</td>
                  {CHANNELS.map((channel) => {
                    const on = !disabled.has(`${category.key}:${channel.key}`);
                    return (
                      <td key={channel.key} className="px-3 py-1.5 text-center">
                        <form action={updateNotificationPreferenceAction}>
                          <input type="hidden" name="category" value={category.key} />
                          <input type="hidden" name="channel" value={channel.key} />
                          <button
                            type="submit"
                            aria-pressed={on}
                            title={on ? "Turn off" : "Turn on"}
                            className={`inline-flex size-7 items-center justify-center rounded-lg border transition-colors ${
                              on
                                ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                                : "border-[var(--border)] text-[var(--text-subtle)]"
                            }`}
                          >
                            {on ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                          </button>
                        </form>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="border-t border-[var(--border)]">
          <p className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Some messages are sent regardless — an account security alert or an urgent
            school-wide notice is not something a preference should be able to
            suppress.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
