import type { Metadata } from "next";
import Link from "next/link";
import { BellOff, MessageSquare, Users } from "lucide-react";

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, formatDateTime, fullName, relativeTime } from "@/lib/utils";

import { markConversationReadAction, toggleMuteAction } from "./actions";
import { NewConversation, ReplyBox } from "./composer";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requirePermission("communication.message");
  const { c: requested } = await searchParams;

  const memberships = await db.conversationMember.findMany({
    where: { userId: user.id },
    orderBy: { conversation: { lastMessageAt: "desc" } },
    take: 100,
    select: {
      lastReadAt: true,
      isMuted: true,
      conversation: {
        select: {
          id: true,
          subject: true,
          kind: true,
          lastMessageAt: true,
          members: {
            select: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  otherNames: true,
                  avatarUrl: true,
                  portal: true,
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true, createdAt: true, senderId: true },
          },
        },
      },
    },
  });

  const threads = memberships.map((membership) => {
    const others = membership.conversation.members
      .map((member) => member.user)
      .filter((member) => member.id !== user.id);
    const latest = membership.conversation.messages[0];

    return {
      id: membership.conversation.id,
      subject: membership.conversation.subject,
      kind: membership.conversation.kind,
      isMuted: membership.isMuted,
      lastMessageAt: membership.conversation.lastMessageAt,
      others,
      preview: latest?.body ?? "",
      // Unread means "someone else wrote since I last looked" — a thread is
      // never unread because of your own message.
      unread: Boolean(
        latest &&
          latest.senderId !== user.id &&
          (!membership.lastReadAt || latest.createdAt > membership.lastReadAt),
      ),
    };
  });

  const activeId =
    threads.find((thread) => thread.id === requested)?.id ?? threads[0]?.id ?? null;

  const [active, people] = await Promise.all([
    activeId
      ? db.conversation.findUnique({
          where: { id: activeId },
          select: {
            id: true,
            subject: true,
            members: { select: { userId: true } },
            messages: {
              orderBy: { createdAt: "asc" },
              take: 200,
              select: {
                id: true,
                body: true,
                createdAt: true,
                senderId: true,
                sender: {
                  select: {
                    firstName: true,
                    lastName: true,
                    otherNames: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        })
      : Promise.resolve(null),
    db.user.findMany({
      where: { status: "ACTIVE", id: { not: user.id } },
      orderBy: [{ portal: "asc" }, { lastName: "asc" }],
      take: 2000,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        portal: true,
        email: true,
      },
    }),
  ]);

  // A conversation the user is not a member of is not theirs to read, however
  // they arrived at the id.
  const authorised =
    active && active.members.some((member) => member.userId === user.id)
      ? active
      : null;

  const unreadCount = threads.filter((thread) => thread.unread).length;

  return (
    <>
      <PageHeader
        title="Messages"
        description="Direct conversations with staff, parents and students."
        action={
          <NewConversation
            people={people.map((person) => ({
              value: person.id,
              label: fullName(person),
              description: person.email ?? undefined,
              group:
                person.portal === "STAFF"
                  ? "Staff"
                  : person.portal === "GUARDIAN"
                    ? "Parents & guardians"
                    : "Students",
            }))}
          />
        }
      />

      {unreadCount ? (
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          {unreadCount} unread conversation{unreadCount === 1 ? "" : "s"}.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="overflow-hidden">
          {threads.length ? (
            <ul className="max-h-[70vh] divide-y divide-[var(--border)] overflow-y-auto">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <Link
                    href={`/messages?c=${thread.id}`}
                    className={cn(
                      "flex gap-2.5 px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)]",
                      thread.id === activeId && "bg-[var(--primary-soft)]",
                    )}
                  >
                    <Avatar
                      name={thread.others[0] ? fullName(thread.others[0]) : "Group"}
                      src={thread.others[0]?.avatarUrl}
                      size={34}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={cn(
                            "min-w-0 truncate text-sm",
                            thread.unread && "font-semibold",
                          )}
                        >
                          {thread.others.length === 1
                            ? fullName(thread.others[0])
                            : (thread.subject ??
                              `${thread.others.length + 1} people`)}
                        </p>
                        <span className="shrink-0 text-[10px] text-[var(--text-subtle)]">
                          {relativeTime(thread.lastMessageAt)}
                        </span>
                      </div>
                      {thread.subject && thread.others.length === 1 ? (
                        <p className="truncate text-xs text-[var(--text-muted)]">
                          {thread.subject}
                        </p>
                      ) : null}
                      <p className="truncate text-xs text-[var(--text-subtle)]">
                        {thread.preview || "No messages yet"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {thread.unread ? (
                        <span
                          className="mt-1 size-2 rounded-full bg-[var(--primary)]"
                          aria-label="Unread"
                        />
                      ) : null}
                      {thread.isMuted ? (
                        <BellOff className="size-3 text-[var(--text-subtle)]" />
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<MessageSquare className="size-5" />}
              title="No conversations"
              description="Start one with the button above."
            />
          )}
        </Card>

        <Card className="flex flex-col overflow-hidden">
          {authorised ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {authorised.subject ??
                      threads.find((thread) => thread.id === authorised.id)?.others
                        .map((person) => fullName(person))
                        .join(", ") ??
                      "Conversation"}
                  </p>
                  <p className="text-xs text-[var(--text-subtle)]">
                    <Users className="mr-1 inline size-3" />
                    {authorised.members.length} participants
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <form action={markConversationReadAction}>
                    <input type="hidden" name="conversationId" value={authorised.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Mark read
                    </Button>
                  </form>
                  <form action={toggleMuteAction}>
                    <input type="hidden" name="conversationId" value={authorised.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      <BellOff className="size-3.5" />
                      {threads.find((thread) => thread.id === authorised.id)?.isMuted
                        ? "Unmute"
                        : "Mute"}
                    </Button>
                  </form>
                </div>
              </div>

              <div className="max-h-[55vh] min-h-[280px] flex-1 space-y-3 overflow-y-auto p-5">
                {authorised.messages.map((message) => {
                  const mine = message.senderId === user.id;
                  return (
                    <div
                      key={message.id}
                      className={cn("flex gap-2.5", mine && "flex-row-reverse")}
                    >
                      <Avatar
                        name={fullName(message.sender)}
                        src={message.sender.avatarUrl}
                        size={30}
                      />
                      <div
                        className={cn(
                          "max-w-[75%] rounded-xl px-3 py-2",
                          mine
                            ? "bg-[var(--primary)] text-white"
                            : "bg-[var(--bg-subtle)]",
                        )}
                      >
                        {!mine ? (
                          <p className="mb-0.5 text-xs font-medium">
                            {fullName(message.sender)}
                          </p>
                        ) : null}
                        <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                        <p
                          className={cn(
                            "mt-1 text-[10px]",
                            mine ? "text-white/70" : "text-[var(--text-subtle)]",
                          )}
                          title={formatDateTime(message.createdAt)}
                        >
                          {relativeTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {authorised.messages.length === 0 ? (
                  <p className="text-center text-sm text-[var(--text-muted)]">
                    No messages yet.
                  </p>
                ) : null}
              </div>

              <ReplyBox conversationId={authorised.id} />
            </>
          ) : (
            <CardBody>
              <EmptyState
                icon={<MessageSquare className="size-5" />}
                title="Nothing selected"
                description="Choose a conversation on the left, or start a new one."
              />
            </CardBody>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardBody className="text-xs text-[var(--text-muted)]">
          Messages here are between named accounts and are visible to both sides. For
          anything that needs to reach many people at once — a whole class, every
          parent, a year group — use{" "}
          <Link href="/communications/compose" className="text-[var(--primary)] hover:underline">
            Send Message
          </Link>
          , which handles SMS, email and push with cost estimates.
        </CardBody>
      </Card>
    </>
  );
}
