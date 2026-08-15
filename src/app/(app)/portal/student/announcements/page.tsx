import type { Metadata } from "next";
import { Megaphone, Pin } from "lucide-react";

import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";

export default async function StudentAnnouncementsPage() {
  await requireUser();

  const announcements = await db.announcement.findMany({
    where: {
      status: "PUBLISHED",
      audiences: { has: "STUDENT" },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    take: 60,
    select: {
      id: true,
      title: true,
      summary: true,
      body: true,
      priority: true,
      isPinned: true,
      category: true,
      publishedAt: true,
      expiresAt: true,
      author: { select: { firstName: true, lastName: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Notices from the school, newest first."
      />

      {announcements.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone className="size-5" />}
            title="Nothing to read"
            description="There are no current announcements for students."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((announcement) => (
            <Card
              key={announcement.id}
              className={
                announcement.priority === "URGENT"
                  ? "border-l-4 border-l-[var(--danger)]"
                  : announcement.isPinned
                    ? "border-l-4 border-l-[var(--primary)]"
                    : undefined
              }
            >
              <CardBody>
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <h2 className="text-base font-semibold">{announcement.title}</h2>
                  {announcement.isPinned ? (
                    <Badge tone="primary">
                      <Pin className="size-2.5" />
                      Pinned
                    </Badge>
                  ) : null}
                  {announcement.priority === "URGENT" ? (
                    <Badge tone="danger">Urgent</Badge>
                  ) : null}
                  {announcement.category ? (
                    <Badge tone="neutral">{announcement.category}</Badge>
                  ) : null}
                </div>

                <p className="mb-2 text-xs text-[var(--text-subtle)]">
                  {relativeTime(announcement.publishedAt)}
                  {announcement.author
                    ? ` · ${announcement.author.firstName} ${announcement.author.lastName}`
                    : ""}
                  {announcement.expiresAt
                    ? ` · until ${formatDate(announcement.expiresAt)}`
                    : ""}
                </p>

                {announcement.summary ? (
                  <p className="mb-2 text-sm font-medium text-[var(--text-muted)]">
                    {announcement.summary}
                  </p>
                ) : null}

                <div className="text-sm whitespace-pre-wrap">{announcement.body}</div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
