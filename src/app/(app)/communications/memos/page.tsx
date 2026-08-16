import type { Metadata } from "next";
import { CheckCircle2, FileSignature, Lock } from "lucide-react";

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
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, humanise, relativeTime } from "@/lib/utils";

import { acknowledgeMemoAction } from "../actions";
import { MemoForm } from "./memo-form";

export const metadata: Metadata = { title: "Memos" };
export const dynamic = "force-dynamic";

const PER_PAGE = 20;

export default async function MemosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("communication.memo.read");
  const canCreate = userCan(user, "communication.memo.create");

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);

  const where = canCreate
    ? {}
    : {
        status: "ISSUED" as const,
        recipients: { some: { userId: user.id } },
      };

  const [memos, total, staffUsers] = await Promise.all([
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
        author: { select: { firstName: true, lastName: true } },
        recipients: {
          select: { userId: true, acknowledgedAt: true },
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
  ]);

  const awaitingMe = memos.filter(
    (memo) =>
      memo.requiresAck &&
      memo.status === "ISSUED" &&
      memo.recipients.some(
        (recipient) => recipient.userId === user.id && !recipient.acknowledgedAt,
      ),
  );

  return (
    <>
      <PageHeader
        title="Memos"
        description="Formal internal notices with reference numbers and acknowledgement tracking."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Memos"
          value={memos.length}
          tone="violet"
          icon={<FileSignature className="size-4" />}
        />
        <StatCard
          label="Awaiting my acknowledgement"
          value={awaitingMe.length}
          tone={awaitingMe.length ? "warning" : "success"}
          icon={<CheckCircle2 className="size-4" />}
        />
        <StatCard
          label="Issued"
          value={memos.filter((memo) => memo.status === "ISSUED").length}
          tone="info"
        />
        <StatCard
          label="Confidential"
          value={memos.filter((memo) => memo.confidential).length}
          tone="danger"
          icon={<Lock className="size-4" />}
        />
      </div>

      <div className={canCreate ? "grid gap-4 lg:grid-cols-[1fr_360px]" : ""}>
        <div className="space-y-3">
          {memos.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FileSignature className="size-5" />}
                title="No memos"
                description="Nothing has been issued to you."
              />
            </Card>
          ) : (
            memos.map((memo) => {
              const mine = memo.recipients.find(
                (recipient) => recipient.userId === user.id,
              );
              const acknowledged = memo.recipients.filter(
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

                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3">
                    {memo.requiresAck ? (
                      <span className="text-xs text-[var(--text-subtle)]">
                        {acknowledged}/{memo.recipients.length} acknowledged
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text-subtle)]">
                        {memo.recipients.length} recipient
                        {memo.recipients.length === 1 ? "" : "s"}
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
                title="New memo"
                description="Issued memos notify their recipients immediately."
              />
              <MemoForm
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
