import type { Metadata } from "next";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  FileSignature,
  Inbox,
  Lock,
  Paperclip,
  Pencil,
  Trash2,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { Pager, pageOf } from "@/components/pager";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBytes, formatDate, humanise, relativeTime } from "@/lib/utils";

import {
  acknowledgeMemoAction,
  deleteMemoDraftAction,
  setMemoMailboxAction,
} from "../actions";
import { MemoForm, type MemoDraft } from "./memo-form";

export const metadata: Metadata = { title: "Memos" };
export const dynamic = "force-dynamic";

const PER_PAGE = 20;

type Box = "inbox" | "drafts" | "archived" | "trash";

const BOXES: Array<{ key: Box; label: string; icon: typeof Inbox }> = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "drafts", label: "Drafts", icon: Pencil },
  { key: "archived", label: "Archived", icon: Archive },
  { key: "trash", label: "Trash", icon: Trash2 },
];

export default async function MemosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("communication.memo.read");
  const canCreate = userCan(user, "communication.memo.create");

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);

  const rawBox = Array.isArray(params.box) ? params.box[0] : params.box;
  const box: Box = (BOXES.find((entry) => entry.key === rawBox)?.key ??
    "inbox") as Box;
  const editId = Array.isArray(params.edit) ? params.edit[0] : params.edit;

  // Each box is a different question about the same table. The inbox is what
  // has been issued to me (or by me) and not filed away; the others are my
  // archive, my bin, and my unfinished writing.
  const where =
    box === "drafts"
      ? { status: "DRAFT" as const, authorId: user.id }
      : box === "archived"
        ? {
            status: "ISSUED" as const,
            recipients: { some: { userId: user.id, archivedAt: { not: null } } },
          }
        : box === "trash"
          ? {
              status: "ISSUED" as const,
              recipients: { some: { userId: user.id, trashedAt: { not: null } } },
            }
          : {
              status: "ISSUED" as const,
              OR: [
                {
                  recipients: {
                    some: { userId: user.id, archivedAt: null, trashedAt: null },
                  },
                },
                // Authors keep sight of what they issued, whoever it went to.
                ...(canCreate ? [{ authorId: user.id }] : []),
              ],
            };

  const [memos, total, staffUsers, draftCount] = await Promise.all([
    db.memo.findMany({
      where,
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take,
      select: {
        id: true,
        referenceNo: true,
        subject: true,
        body: true,
        kind: true,
        priority: true,
        status: true,
        confidential: true,
        requiresAck: true,
        issuedAt: true,
        createdAt: true,
        fromDepartment: true,
        authorId: true,
        author: { select: { firstName: true, lastName: true } },
        recipients: {
          select: {
            userId: true,
            kind: true,
            acknowledgedAt: true,
            archivedAt: true,
            trashedAt: true,
          },
        },
        attachments: {
          select: {
            fileId: true,
            file: { select: { originalName: true, sizeBytes: true } },
          },
        },
      },
    }),
    db.memo.count({ where }),
    canCreate
      ? db.user.findMany({
          where: { portal: "STAFF", status: "ACTIVE" },
          orderBy: { lastName: "asc" },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staff: { select: { jobTitle: true, department: true } },
          },
        })
      : Promise.resolve([]),
    canCreate
      ? db.memo.count({ where: { status: "DRAFT", authorId: user.id } })
      : Promise.resolve(0),
  ]);

  // A draft being reopened for editing.
  const editing = editId
    ? await db.memo.findFirst({
        where: { id: editId, status: "DRAFT", authorId: user.id },
        select: {
          id: true,
          subject: true,
          body: true,
          kind: true,
          priority: true,
          fromDepartment: true,
          requiresAck: true,
          confidential: true,
          recipients: { select: { userId: true, kind: true } },
          attachments: {
            select: {
              fileId: true,
              file: { select: { originalName: true, sizeBytes: true } },
            },
          },
        },
      })
    : null;

  const draft: MemoDraft | undefined = editing
    ? {
        id: editing.id,
        subject: editing.subject,
        body: editing.body,
        kind: editing.kind,
        priority: editing.priority,
        fromDepartment: editing.fromDepartment ?? "",
        requiresAck: editing.requiresAck,
        confidential: editing.confidential,
        to: editing.recipients.filter((r) => r.kind === "TO").map((r) => r.userId),
        cc: editing.recipients.filter((r) => r.kind === "CC").map((r) => r.userId),
        bcc: editing.recipients.filter((r) => r.kind === "BCC").map((r) => r.userId),
        attachments: editing.attachments.map((entry) => ({
          fileId: entry.fileId,
          name: entry.file.originalName,
          sizeBytes: entry.file.sizeBytes,
        })),
      }
    : undefined;

  const awaitingMe = memos.filter(
    (memo) =>
      memo.requiresAck &&
      memo.status === "ISSUED" &&
      memo.recipients.some(
        (recipient) => recipient.userId === user.id && !recipient.acknowledgedAt,
      ),
  );

  const boxHref = (key: Box) =>
    key === "inbox" ? "/communications/memos" : `/communications/memos?box=${key}`;

  return (
    <>
      <PageHeader
        title="Memos"
        description="Formal internal notices with reference numbers, attachments and acknowledgement tracking."
        action={<RefreshButton />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={box === "inbox" ? "In your inbox" : humanise(box)}
          value={total}
          tone="violet"
          icon={<FileSignature className="size-4" />}
        />
        <StatCard
          label="Awaiting my acknowledgement"
          value={awaitingMe.length}
          tone={awaitingMe.length ? "warning" : "success"}
          icon={<CheckCircle2 className="size-4" />}
        />
        {canCreate ? (
          <StatCard
            label="My drafts"
            value={draftCount}
            tone={draftCount ? "info" : "success"}
            icon={<Pencil className="size-4" />}
          />
        ) : null}
        <StatCard
          label="Confidential here"
          value={memos.filter((memo) => memo.confidential).length}
          tone="danger"
          icon={<Lock className="size-4" />}
        />
      </div>

      {/* The mailbox switcher. Drafts only exist for people who can write. */}
      <div className="scrollbar-none mb-4 flex gap-1 overflow-x-auto border-b border-[var(--border)] pb-px">
        {BOXES.filter((entry) => entry.key !== "drafts" || canCreate).map((entry) => {
          const isActive = entry.key === box;
          const Icon = entry.icon;
          return (
            <Link
              key={entry.key}
              href={boxHref(entry.key)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                isActive
                  ? "border-[var(--primary)] font-medium text-[var(--primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              <Icon className="size-4" />
              {entry.label}
              {entry.key === "drafts" && draftCount ? (
                <span className="numeric rounded-full bg-[var(--primary-soft)] px-1.5 text-[10px] font-semibold text-[var(--primary)]">
                  {draftCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <div className={canCreate ? "grid gap-4 lg:grid-cols-[1fr_360px]" : ""}>
        <div className="space-y-3">
          {memos.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FileSignature className="size-5" />}
                title={
                  box === "drafts"
                    ? "No drafts"
                    : box === "archived"
                      ? "Nothing archived"
                      : box === "trash"
                        ? "The bin is empty"
                        : "No memos"
                }
                description={
                  box === "inbox"
                    ? "Nothing has been issued to you."
                    : box === "drafts"
                      ? "Saved drafts wait here until they are issued."
                      : box === "trash"
                        ? "Discarded memos can be restored from here."
                        : "Memos you file away land here."
                }
              />
            </Card>
          ) : (
            memos.map((memo) => {
              const mine = memo.recipients.find(
                (recipient) => recipient.userId === user.id,
              );
              const isAuthor = memo.authorId === user.id;

              // BCC recipients are visible to the author and to themselves,
              // never to the rest of the list — that is the entire point of
              // the field, and the count must not leak them either.
              const visibleRecipients = memo.recipients.filter(
                (recipient) =>
                  recipient.kind !== "BCC" ||
                  isAuthor ||
                  recipient.userId === user.id,
              );
              // Counted over the same visibility-filtered list as the display —
              // an x/3 over two visible names advertises the blind copy.
              const acknowledged = visibleRecipients.filter(
                (recipient) => recipient.acknowledgedAt,
              ).length;

              return (
                <Card key={memo.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="numeric text-xs text-[var(--text-subtle)]">
                          {memo.referenceNo}
                        </span>
                        <Badge tone="neutral">{humanise(memo.kind)}</Badge>
                        {memo.confidential ? (
                          <Badge tone="danger">
                            <Lock className="size-2.5" />
                            Confidential
                          </Badge>
                        ) : null}
                        {memo.priority === "URGENT" ? (
                          <Badge tone="danger">Urgent</Badge>
                        ) : null}
                        {mine?.kind === "CC" ? <Badge tone="info">CC</Badge> : null}
                        {mine?.kind === "BCC" ? <Badge tone="warning">BCC</Badge> : null}
                      </div>
                      <h2 className="mt-1 text-sm font-semibold">{memo.subject}</h2>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {memo.author
                          ? `${memo.author.firstName} ${memo.author.lastName}`
                          : "School office"}
                        {memo.fromDepartment ? ` · ${memo.fromDepartment}` : ""} ·{" "}
                        {memo.issuedAt
                          ? relativeTime(memo.issuedAt)
                          : `drafted ${relativeTime(memo.createdAt)}`}
                      </p>
                    </div>
                    <StatusBadge status={memo.status} />
                  </div>

                  <p className="mt-3 text-sm whitespace-pre-line text-[var(--text-muted)]">
                    {memo.body}
                  </p>

                  {memo.attachments.length ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {memo.attachments.map((entry) => (
                        <li key={entry.fileId}>
                          <a
                            href={`/api/files/${entry.fileId}?download=1`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs hover:bg-[var(--bg)]"
                          >
                            <Paperclip className="size-3 text-[var(--text-subtle)]" />
                            <span className="max-w-48 truncate">
                              {entry.file.originalName}
                            </span>
                            <span className="text-[var(--text-subtle)]">
                              {formatBytes(entry.file.sizeBytes)}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3">
                    {memo.requiresAck ? (
                      <span className="text-xs text-[var(--text-subtle)]">
                        {acknowledged}/{visibleRecipients.length} acknowledged
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text-subtle)]">
                        {visibleRecipients.length} recipient
                        {visibleRecipients.length === 1 ? "" : "s"}
                      </span>
                    )}

                    {mine && memo.requiresAck && memo.status === "ISSUED" ? (
                      mine.acknowledgedAt ? (
                        <Badge tone="success">
                          Acknowledged {formatDate(mine.acknowledgedAt)}
                        </Badge>
                      ) : (
                        <form
                          action={async () => {
                            "use server";
                            await acknowledgeMemoAction(memo.id);
                          }}
                        >
                          <Button type="submit" size="sm">
                            <CheckCircle2 className="size-3.5" />
                            Acknowledge
                          </Button>
                        </form>
                      )
                    ) : null}

                    <span className="flex-1" />

                    {/* Draft controls for the author; mailbox controls for a
                        recipient. */}
                    {memo.status === "DRAFT" && isAuthor ? (
                      <>
                        <Link
                          href={`/communications/memos?box=drafts&edit=${memo.id}`}
                          className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
                        >
                          <Pencil className="size-3" />
                          Edit and issue
                        </Link>
                        <form action={deleteMemoDraftAction}>
                          <input type="hidden" name="memoId" value={memo.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            <Trash2 className="size-3.5" />
                            Discard
                          </Button>
                        </form>
                      </>
                    ) : null}

                    {mine && memo.status === "ISSUED" ? (
                      box === "trash" || box === "archived" ? (
                        <form action={setMemoMailboxAction}>
                          <input type="hidden" name="memoId" value={memo.id} />
                          <input type="hidden" name="state" value="restore" />
                          <Button type="submit" variant="ghost" size="sm">
                            <ArchiveRestore className="size-3.5" />
                            Restore
                          </Button>
                        </form>
                      ) : (
                        <>
                          <form action={setMemoMailboxAction}>
                            <input type="hidden" name="memoId" value={memo.id} />
                            <input type="hidden" name="state" value="archive" />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              title="File it away. Your copy only."
                            >
                              <Archive className="size-3.5" />
                              Archive
                            </Button>
                          </form>
                          <form action={setMemoMailboxAction}>
                            <input type="hidden" name="memoId" value={memo.id} />
                            <input type="hidden" name="state" value="trash" />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              title="Move to your bin. Restorable."
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </form>
                        </>
                      )
                    ) : null}
                  </div>
                </Card>
              );
            })
          )}

          <Pager
            basePath="/communications/memos"
            searchParams={params}
            page={page}
            perPage={PER_PAGE}
            total={total}
            label="memos"
          />
        </div>

        {canCreate ? (
          <div>
            <Card className="lg:sticky lg:top-20">
              <CardHeader
                title={draft ? `Editing ${editing?.subject}` : "New memo"}
                description={
                  draft
                    ? "Issuing sends it and notifies everyone on it."
                    : "Issued memos notify their recipients immediately."
                }
              />
              <MemoForm
                key={draft?.id ?? "new"}
                draft={draft}
                recipients={staffUsers.map((entry) => ({
                  value: entry.id,
                  label: `${entry.firstName} ${entry.lastName}`,
                  description: entry.staff?.jobTitle ?? undefined,
                  group: entry.staff?.department ?? "Other",
                }))}
              />
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
