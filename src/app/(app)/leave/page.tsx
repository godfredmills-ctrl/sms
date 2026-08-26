import type { Metadata } from "next";
import Link from "next/link";
import { CalendarOff, Check, Clock, Users, X } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { requireUser, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, fullName, humanise } from "@/lib/utils";

import { cancelLeaveAction } from "./actions";
import { DecideButtons, RequestLeaveForm } from "./leave-forms";

export const metadata: Metadata = { title: "Leave" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

/**
 * Leave, both sides of it: my requests, and — for whoever holds the approval
 * permission — everyone's queue. The permission and the model have existed
 * from the start; the staff profile even displayed requests. Nothing could
 * create or decide one.
 */
export default async function LeavePage() {
  const user = await requireUser();
  const canManage = userCan(user, "staff.leave.manage");
  const year = new Date().getFullYear();

  const [mine, queue, decidedRecently] = await Promise.all([
    user.staffId
      ? db.staffLeave.findMany({
          where: { staffId: user.staffId },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    canManage
      ? db.staffLeave.findMany({
          where: { status: "PENDING" },
          orderBy: { startDate: "asc" },
          include: {
            staff: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                otherNames: true,
                jobTitle: true,
                department: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    canManage
      ? db.staffLeave.findMany({
          where: { status: { in: ["APPROVED", "REJECTED"] } },
          orderBy: { approvedAt: "desc" },
          take: 10,
          include: {
            staff: { select: { firstName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const approvedDaysThisYear = mine
    .filter(
      (request) =>
        request.status === "APPROVED" &&
        request.startDate.getFullYear() === year,
    )
    .reduce((sum, request) => sum + request.days, 0);
  const pendingMine = mine.filter((request) => request.status === "PENDING").length;

  return (
    <>
      <PageHeader
        title="Leave"
        description={
          canManage
            ? "Your own requests, and the queue waiting on your signature."
            : "Request time away, and see where each request stands."
        }
        action={<RefreshButton />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={`Approved days in ${year}`}
          value={approvedDaysThisYear}
          tone="info"
          icon={<CalendarOff className="size-4" />}
        />
        <StatCard
          label="My pending requests"
          value={pendingMine}
          tone={pendingMine ? "warning" : "success"}
          icon={<Clock className="size-4" />}
        />
        {canManage ? (
          <StatCard
            label="Awaiting my decision"
            value={queue.length}
            tone={queue.length ? "warning" : "success"}
            icon={<Users className="size-4" />}
          />
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* The approval queue comes first for approvers — it is other
              people's time waiting on them. */}
          {canManage ? (
            <Card>
              <CardHeader
                title="Waiting for a decision"
                description="Your own requests are excluded: someone else signs those."
              />
              {queue.length ? (
                <ul className="divide-y divide-[var(--border)]">
                  {queue.map((request) => (
                    <li
                      key={request.id}
                      className="flex flex-wrap items-center gap-3 px-5 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/staff/${request.staff.id}?tab=leave`}
                          className="text-sm font-medium hover:text-[var(--primary)]"
                        >
                          {fullName(request.staff)}
                        </Link>
                        <p className="text-xs text-[var(--text-subtle)]">
                          {[request.staff.jobTitle, request.staff.department]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {humanise(request.leaveType)} ·{" "}
                          <span className="numeric">
                            {formatDate(request.startDate)} to {formatDate(request.endDate)}
                          </span>{" "}
                          · {request.days} day{request.days === 1 ? "" : "s"}
                        </p>
                        {request.reason ? (
                          <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                            “{request.reason}”
                          </p>
                        ) : null}
                      </div>
                      <DecideButtons requestId={request.id} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={<Check className="size-5" />}
                  title="Nothing waiting"
                  description="Every request has been decided."
                />
              )}
            </Card>
          ) : null}

          <Card>
            <CardHeader title="My requests" />
            {mine.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {mine.map((request) => (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {humanise(request.leaveType)}
                        <span className="numeric ml-2 text-xs font-normal text-[var(--text-subtle)]">
                          {formatDate(request.startDate)} to {formatDate(request.endDate)} ·{" "}
                          {request.days} day{request.days === 1 ? "" : "s"}
                        </span>
                      </p>
                      {request.status !== "PENDING" && request.comments ? (
                        <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                          {request.approvedBy}: “{request.comments}”
                        </p>
                      ) : null}
                    </div>
                    <Badge tone={STATUS_TONE[request.status] ?? "neutral"}>
                      {humanise(request.status)}
                    </Badge>
                    {request.status === "PENDING" ? (
                      <form action={cancelLeaveAction}>
                        <input type="hidden" name="id" value={request.id} />
                        <Button type="submit" variant="ghost" size="sm" title="Withdraw">
                          <X className="size-3.5" />
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<CalendarOff className="size-5" />}
                title="No requests yet"
                description={
                  user.staffId
                    ? "Use the form to make one."
                    : "Your account has no staff record, so there is no leave to request."
                }
              />
            )}
          </Card>

          {canManage && decidedRecently.length ? (
            <Card>
              <CardHeader title="Recently decided" />
              <ul className="divide-y divide-[var(--border)]">
                {decidedRecently.map((request) => (
                  <li
                    key={request.id}
                    className="flex items-center gap-2 px-5 py-2.5 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {request.staff.firstName} {request.staff.lastName} ·{" "}
                      {humanise(request.leaveType)} · {request.days}d
                    </span>
                    <Badge tone={STATUS_TONE[request.status] ?? "neutral"}>
                      {humanise(request.status)}
                    </Badge>
                    <span className="shrink-0 text-[var(--text-subtle)]">
                      {request.approvedBy}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        {user.staffId ? (
          <div>
            <Card className="lg:sticky lg:top-20">
              <CardHeader
                title="Request leave"
                description="Working days only: weekends are not counted against you."
              />
              <RequestLeaveForm />
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
