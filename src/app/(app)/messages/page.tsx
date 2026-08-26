import type { Metadata } from "next";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  BellOff,
  FileText,
  Inbox,
  MessageSquare,
  Paperclip,
  PenLine,
  Trash2,
  Users,
} from "lucide-react";

import {
  Alert,
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
import { cn, formatBytes, formatDateTime, fullName, relativeTime } from "@/lib/utils";

import {
  markConversationReadAction,
  setMailboxAction,
  toggleMuteAction,
} from "./actions";
import { NewConversation, ReplyBox } from "./composer";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

/**
 * The four folders an email client has.
 *
 * Drafts is derived rather than stored: a thread is in Drafts because it
 * holds an unsent reply, and it leaves the moment that reply is sent. That
 * is one fewer state to keep honest.
 */
const FOLDERS = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "drafts", label: "Drafts", icon: PenLine },
  { key: "archive", label: "Archive", icon: Archive },
  { key: "trash", label: "Trash", icon: Trash2 },
] as const;

type FolderKey = (typeof FOLDERS)[number]["key"];

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; folder?: string }>;
}) {
  const user = await requirePermission("communication.message");
  const { c: requested, folder: requestedFolder } = await searchParams;

  const folder: FolderKey = FOLDERS.some((entry) => entry.key === requestedFolder)
    ? (requestedFolder as FolderKey)
    : "inbox";

  const folderWhere =
    folder === "archive"
      ? { archivedAt: { not: null }, trashedAt: null }
      : folder === "trash"
        ? { trashedAt: { not: null } }
        : folder === "drafts"
          ? { trashedAt: null, draftBody: { not: null } }
          : { archivedAt: null, trashedAt: null };

  const [inboxCount, draftCount, archiveCount, trashCount, memberships] =
    await Promise.all([
      db.conversationMember.count({
        where: { userId: user.id, archivedAt: null, trashedAt: null },
      }),
      db.conversationMember.count({
        where: { userId: user.id, trashedAt: null, draftBody: { not: null } },
      }),
      db.conversationMember.count({
        where: { userId: user.id, archivedAt: { not: null }, trashedAt: null },
      }),
      db.conversationMember.count({
        where: { userId: user.id, trashedAt: { not: null } },
      }),
      db.conversationMember.findMany({
        where: { userId: user.id, ...folderWhere },
        orderBy: { conversation: { lastMessageAt: "desc" } },
        take: 100,
        select: {
          lastReadAt: true,
          isMuted: true,
          draftBody: true,
          conversation: {
            select: {
              id: true,
              subject: true,
              kind: true,
              lastMessageAt: true,
              members: {
                select: {
                  role: true,
                  addedById: true,
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
      }),
    ]);

  const counts: Record<FolderKey, number> = {
    inbox: inboxCount,
    drafts: draftCount,
    archive: archiveCount,
    trash: trashCount,
  };

  const threads = memberships.map((membership) => {
    // A blind copy is blind to the other RECIPIENTS. Two exceptions keep it
    // honest rather than merely secret: the person who sent it can see what
    // they did, and everyone can always see themselves.
    const others = membership.conversation.members
      .filter(
        (member) =>
          member.user.id !== user.id &&
          (member.role !== "BCC" || member.addedById === user.id),
      )
      .map((member) => member.user);

    const myRole =
      membership.conversation.members.find((member) => member.user.id === user.id)
        ?.role ?? "TO";
    const latest = membership.conversation.messages[0];

    return {
      id: membership.conversation.id,
      subject: membership.conversation.subject,
      kind: membership.conversation.kind,
      isMuted: membership.isMuted,
      draft: membership.draftBody,
      lastMessageAt: membership.conversation.lastMessageAt,
      others,
      myRole,
      // A message can be nothing but a file, which the list used to render as
      // "No messages yet".
      preview: latest?.body || (latest ? "Sent an attachment" : ""),
      // Unread means "someone else wrote since I last looked" — a thread is
      // never unread because of your own message.
      unread: Boolean(
        latest &&
          latest.senderId !== user.id &&
          (!membership.lastReadAt || latest.createdAt > membership.lastReadAt),
      ),
    };
  });

  // When ?c= names a thread that is not in this folder — an archived one
  // linked from a notification, say — the thread wins and the folder follows
  // it. Falling back to threads[0] silently opened a DIFFERENT conversation,
  // and the reply box beneath it would have sent to the wrong people.
  const requestedElsewhere =
    requested && !threads.some((thread) => thread.id === requested)
      ? await db.conversationMember.findUnique({
          where: { conversationId_userId: { conversationId: requested, userId: user.id } },
          select: { conversationId: true },
        })
      : null;

  const activeId =
    threads.find((thread) => thread.id === requested)?.id ??
    requestedElsewhere?.conversationId ??
    threads[0]?.id ??
    null;

  const [active, people] = await Promise.all([
    activeId
      ? db.conversation.findUnique({
          where: { id: activeId },
          select: {
            id: true,
            subject: true,
            members: { select: { userId: true, role: true } },
            messages: {
              orderBy: { createdAt: "asc" },
              take: 200,
              select: {
                id: true,
                body: true,
                attachmentIds: true,
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

  // Attachments are file ids on the message; the files themselves are read
  // through /api/files, which checks access per request.
  const attachmentIds = [
    ...new Set((authorised?.messages ?? []).flatMap((message) => message.attachmentIds)),
  ];
  const files = attachmentIds.length
    ? await db.fileAsset.findMany({
        where: { id: { in: attachmentIds }, deletedAt: null },
        select: { id: true, originalName: true, sizeBytes: true, mimeType: true },
      })
    : [];
  const fileById = new Map(files.map((file) => [file.id, file]));

  const activeMembership = memberships.find(
    (membership) => membership.conversation.id === activeId,
  );
  const activeThread = threads.find((thread) => thread.id === activeId);

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

      {/* --- Folders ---------------------------------------------------- */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FOLDERS.map((entry) => {
          const Icon = entry.icon;
          const active = entry.key === folder;
          return (
            <Link
              key={entry.key}
              href={`/messages?folder=${entry.key}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]",
              )}
            >
              <Icon className="size-3.5" />
              {entry.label}
              {counts[entry.key] ? (
                <span className="numeric opacity-70">{counts[entry.key]}</span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="overflow-hidden">
          {threads.length ? (
            <ul className="max-h-[70vh] divide-y divide-[var(--border)] overflow-y-auto">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <Link
                    href={`/messages?folder=${folder}&c=${thread.id}`}
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
                      {thread.draft ? (
                        <p className="truncate text-xs text-[var(--warning)]">
                          Draft: {thread.draft}
                        </p>
                      ) : (
                        <p className="truncate text-xs text-[var(--text-subtle)]">
                          {thread.preview || "No messages yet"}
                        </p>
                      )}
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
              title={
                folder === "inbox"
                  ? "No conversations"
                  : folder === "drafts"
                    ? "No drafts"
                    : folder === "archive"
                      ? "Nothing archived"
                      : "Trash is empty"
              }
              description={
                folder === "inbox"
                  ? "Start one with the button above."
                  : "Threads you move here will appear in this folder."
              }
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
                      activeThread?.others
                        .map((person) => fullName(person))
                        .join(", ") ??
                      "Conversation"}
                  </p>
                  <p className="text-xs text-[var(--text-subtle)]">
                    <Users className="mr-1 inline size-3" />
                    {/* Counted over what this viewer can see, so the number
                        does not quietly disclose a blind copy. */}
                    {activeThread ? activeThread.others.length + 1 : 1} participants
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
                      {activeThread?.isMuted ? "Unmute" : "Mute"}
                    </Button>
                  </form>
                  <form action={setMailboxAction}>
                    <input type="hidden" name="conversationId" value={authorised.id} />
                    <input
                      type="hidden"
                      name="folder"
                      value={folder === "inbox" || folder === "drafts" ? "archive" : "inbox"}
                    />
                    <Button type="submit" variant="ghost" size="sm">
                      {folder === "inbox" || folder === "drafts" ? (
                        <>
                          <Archive className="size-3.5" />
                          Archive
                        </>
                      ) : (
                        <>
                          <ArchiveRestore className="size-3.5" />
                          Move to inbox
                        </>
                      )}
                    </Button>
                  </form>
                  {folder !== "trash" ? (
                    <form action={setMailboxAction}>
                      <input type="hidden" name="conversationId" value={authorised.id} />
                      <input type="hidden" name="folder" value="trash" />
                      <Button type="submit" variant="ghost" size="sm">
                        <Trash2 className="size-3.5" />
                        Trash
                      </Button>
                    </form>
                  ) : null}
                </div>
              </div>

              <div className="max-h-[55vh] min-h-[280px] flex-1 space-y-3 overflow-y-auto p-5">
                {authorised.messages.map((message) => {
                  const mine = message.senderId === user.id;
                  const attachments = message.attachmentIds
                    .map((id) => fileById.get(id))
                    .filter(Boolean);

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
                        {message.body ? (
                          <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                        ) : null}

                        {attachments.length ? (
                          <ul className="mt-1.5 space-y-1">
                            {attachments.map((file) => (
                              <li key={file!.id}>
                                <a
                                  href={`/api/files/${file!.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={cn(
                                    "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
                                    mine
                                      ? "border-white/30 text-white hover:bg-white/10"
                                      : "border-[var(--border-strong)] hover:bg-[var(--bg)]",
                                  )}
                                >
                                  <FileText className="size-3 shrink-0" />
                                  <span className="truncate">{file!.originalName}</span>
                                  <span
                                    className={cn(
                                      "numeric shrink-0 text-[10px]",
                                      mine ? "text-white/70" : "text-[var(--text-subtle)]",
                                    )}
                                  >
                                    {formatBytes(file!.sizeBytes)}
                                  </span>
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : null}

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

              {activeThread?.myRole === "BCC" && folder !== "trash" ? (
                <div className="border-t border-[var(--border)] px-5 py-3">
                  <Alert tone="warning">
                    You were blind-copied on this conversation. The other people in
                    it cannot see that you are here: until you reply, which puts
                    your name and your message in front of all of them.
                  </Alert>
                </div>
              ) : null}

              {folder === "trash" ? (
                <CardBody className="border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
                  This conversation is in your trash. Move it back to the inbox to
                  reply: the messages themselves are kept either way, because a
                  thread about a child is a record the school may need.
                </CardBody>
              ) : (
                <ReplyBox
                  conversationId={authorised.id}
                  draft={activeMembership?.draftBody ?? ""}
                />
              )}
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
          anything that needs to reach many people at once: a whole class, every
          parent, a year group: use{" "}
          <Link href="/communications/compose" className="text-[var(--primary)] hover:underline">
            Send Message
          </Link>
          , which handles SMS, email and push with cost estimates.
        </CardBody>
      </Card>
    </>
  );
}
