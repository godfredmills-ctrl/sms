import type { Metadata } from "next";
import Link from "next/link";
import {
  Bell,
  CalendarCheck,
  CheckCheck,
  FileText,
  Megaphone,
  Vote,
  Wallet,
} from "lucide-react";

import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";

import { markAllReadAction, markNotificationReadAction } from "./actions";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const ICONS: Record<string, typeof Bell> = {
  FEE: Wallet,
  ATTENDANCE: CalendarCheck,
  RESULT: FileText,
  ANNOUNCEMENT: Megaphone,
  MEMO: FileText,
  ELECTION: Vote,
  SYSTEM: Bell,
};

export default async function NotificationsPage() {
  const user = await requireUser();

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const unread = notifications.filter((entry) => !entry.readAt);
  const urgent = unread.filter((entry) => entry.priority === "HIGH" || entry.priority === "URGENT");

  const byCategory = new Map<string, number>();
  for (const entry of notifications) {
    byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Everything the system has sent you."
        action={
          unread.length ? (
            <form action={markAllReadAction}>
              <Button type="submit" variant="outline" size="sm">
                <CheckCheck className="size-4" />
                Mark all read
              </Button>
            </form>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Unread"
          value={unread.length}
          tone={unread.length ? "warning" : "success"}
          icon={<Bell className="size-4" />}
        />
        <StatCard
          label="Needs attention"
          value={urgent.length}
          hint="High or urgent priority"
          tone={urgent.length ? "danger" : "success"}
        />
        <StatCard label="Total received" value={notifications.length} tone="violet" />
        <StatCard
          label="Categories"
          value={byCategory.size}
          hint={[...byCategory.keys()].slice(0, 3).join(", ")}
          tone="info"
        />
      </div>

      <Card>
        <CardHeader
          title="Recent"
          description="Newest first. Selecting one opens what it refers to."
        />
        {notifications.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {notifications.map((notification) => {
              const Icon = ICONS[notification.category] ?? Bell;
              const isUnread = !notification.readAt;

              const body = (
                <div className="flex gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                      notification.priority === "URGENT"
                        ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                        : isUnread
                          ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                          : "bg-[var(--bg-subtle)] text-[var(--text-subtle)]",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className={cn("text-sm", isUnread && "font-semibold")}>
                        {notification.title}
                      </p>
                      <Badge tone="neutral">{notification.category}</Badge>
                      {notification.priority === "URGENT" ? (
                        <Badge tone="danger">Urgent</Badge>
                      ) : null}
                    </div>
                    {notification.body ? (
                      <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                        {notification.body}
                      </p>
                    ) : null}
                    <p
                      className="mt-1 text-xs text-[var(--text-subtle)]"
                      title={formatDateTime(notification.createdAt)}
                    >
                      {relativeTime(notification.createdAt)}
                    </p>
                  </div>
                  {isUnread ? (
                    <span
                      className="mt-2 size-2 shrink-0 rounded-full bg-[var(--primary)]"
                      aria-label="Unread"
                    />
                  ) : null}
                </div>
              );

              return (
                <li
                  key={notification.id}
                  className={cn(
                    "px-5 py-3",
                    isUnread && "bg-[var(--primary-soft)]/30",
                  )}
                >
                  {notification.url ? (
                    <form action={markNotificationReadAction}>
                      <input type="hidden" name="id" value={notification.id} />
                      <input type="hidden" name="url" value={notification.url} />
                      <button type="submit" className="w-full text-left">
                        {body}
                      </button>
                    </form>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<Bell className="size-5" />}
            title="Nothing yet"
            description="Fee reminders, published results and announcements will appear here."
          />
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Delivery preferences" />
        <div className="p-5 text-sm text-[var(--text-muted)]">
          Choose which categories reach you by SMS, email and push under{" "}
          <Link href="/account" className="text-[var(--primary)] hover:underline">
            your account
          </Link>
          .
        </div>
      </Card>
    </>
  );
}
