import type { Metadata } from "next";
import { Archive, Megaphone, Pin, Send } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { humanise, relativeTime } from "@/lib/utils";

import { archiveAnnouncementAction, publishAnnouncementAction } from "../actions";
import { AnnouncementForm } from "./announcement-form";

export const metadata: Metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const user = await requirePermission("communication.announcement.read");
  const canManage = userCan(user, "communication.announcement.manage");

  // Everyone sees what is published to their portal; editors also see drafts.
  const announcements = await db.announcement.findMany({
    where: canManage
      ? {}
      : { status: "PUBLISHED", audiences: { has: user.portal } },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    take: 60,
    select: {
      id: true,
      title: true,
      summary: true,
      body: true,
      category: true,
      priority: true,
      status: true,
      audiences: true,
      channels: true,
      isPinned: true,
      publishedAt: true,
      createdAt: true,
      viewCount: true,
      author: { select: { firstName: true, lastName: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Announcements"
        description={
          canManage
            ? "Post to the whole school or to a single audience."
            : "News and notices from the school."
        }
      />

      <div className={canManage ? "grid gap-4 lg:grid-cols-[1fr_360px]" : ""}>
        <div className="space-y-3">
          {announcements.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Megaphone className="size-5" />}
                title="No announcements"
                description={
                  canManage
                    ? "Write the first one using the form."
                    : "Nothing has been posted yet."
                }
              />
            </Card>
          ) : (
            announcements.map((announcement) => (
              <Card key={announcement.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold">{announcement.title}</h2>
                      {announcement.isPinned ? (
                        <Badge tone="primary">
                          <Pin className="size-2.5" />
                          Pinned
                        </Badge>
                      ) : null}
                      {announcement.priority === "URGENT" ? (
                        <Badge tone="danger">Urgent</Badge>
                      ) : announcement.priority === "HIGH" ? (
                        <Badge tone="warning">High</Badge>
                      ) : null}
                      <Badge tone="neutral">{humanise(announcement.category)}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                      {announcement.author
                        ? `${announcement.author.firstName} ${announcement.author.lastName} · `
                        : ""}
                      {relativeTime(announcement.publishedAt ?? announcement.createdAt)}
                      {announcement.viewCount
                        ? ` · ${announcement.viewCount} views`
                        : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {canManage ? <StatusBadge status={announcement.status} /> : null}
                  </div>
                </div>

                <p className="mt-3 text-sm whitespace-pre-line text-[var(--text-muted)]">
                  {announcement.body}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {announcement.audiences.map((audience) => (
                    <Badge key={audience} tone="info">
                      {audience === "GUARDIAN"
                        ? "Parents"
                        : humanise(audience)}
                    </Badge>
                  ))}
                  {announcement.channels.map((channel) => (
                    <Badge key={channel} tone="neutral">
                      {humanise(channel)}
                    </Badge>
                  ))}
                </div>

                {canManage ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                    {announcement.status !== "PUBLISHED" ? (
                      <form
                        action={async () => {
                          "use server";
                          await publishAnnouncementAction(announcement.id);
                        }}
                      >
                        <Button type="submit" size="sm" variant="outline">
                          <Send className="size-3.5" />
                          Publish
                        </Button>
                      </form>
                    ) : null}
                    {announcement.status !== "ARCHIVED" ? (
                      <form
                        action={async () => {
                          "use server";
                          await archiveAnnouncementAction(announcement.id);
                        }}
                      >
                        <Button type="submit" size="sm" variant="ghost">
                          <Archive className="size-3.5" />
                          Archive
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            ))
          )}
        </div>

        {canManage ? (
          <div>
            <Card className="lg:sticky lg:top-20">
              <CardHeader
                title="New announcement"
                description="Publishing also notifies the audiences you choose."
              />
              <AnnouncementForm />
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
