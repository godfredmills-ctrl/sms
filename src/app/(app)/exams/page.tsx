import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ClipboardList, Users } from "lucide-react";

import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";

import { NewSession } from "./new-session";
import type { TermOption } from "./session-form";

export const metadata: Metadata = { title: "Examinations" };
export const dynamic = "force-dynamic";

const STATUS_TONE = {
  DRAFT: "warning",
  PUBLISHED: "success",
  COMPLETED: "neutral",
} as const;

const STATUS_LABEL = {
  DRAFT: "Being set up",
  PUBLISHED: "Timetable out",
  COMPLETED: "Sat",
} as const;

export default async function ExamsPage() {
  const user = await requirePermission([
    "assessment.exam.read",
    "assessment.exam.manage",
    "assessment.exam.attendance",
  ]);
  const canManage = userCan(user, "assessment.exam.manage");

  const [sessions, terms] = await Promise.all([
    db.examSession.findMany({
      orderBy: { startsOn: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        status: true,
        startsOn: true,
        endsOn: true,
        term: { select: { name: true, academicYear: { select: { name: true } } } },
        _count: { select: { papers: true, candidates: true } },
      },
    }),
    db.term.findMany({
      orderBy: { startDate: "desc" },
      take: 12,
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        academicYear: { select: { name: true } },
      },
    }),
  ]);

  const termOptions: TermOption[] = terms.map((term) => ({
    id: term.id,
    label: `${term.name}, ${term.academicYear.name}`,
    startsOn: term.startDate.toISOString().slice(0, 10),
    endsOn: term.endDate.toISOString().slice(0, 10),
  }));

  return (
    <>
      <PageHeader
        title="Examinations"
        description="The sitting itself: which paper, at what hour, in which hall, in which seat, watched by whom. Marks are entered in the gradebook afterwards."
      />

      {canManage ? <NewSession terms={termOptions} /> : null}

      {sessions.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-6" />}
          title="No examinations yet"
          description={
            canManage
              ? "Set up a run of papers, enter the year groups, and the index numbers and seating follow."
              : "Nothing has been timetabled yet."
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/exams/${session.id}`}
              className="card block p-4 transition-colors hover:border-[var(--primary)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--text)]">{session.name}</p>
                  <p className="truncate text-xs text-[var(--text-subtle)]">
                    {session.term
                      ? `${session.term.name}, ${session.term.academicYear.name}`
                      : "No term"}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[session.status]}>
                  {STATUS_LABEL[session.status]}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" />
                  {formatDate(session.startsOn)} to {formatDate(session.endsOn)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ClipboardList className="size-3.5" />
                  {session._count.papers} paper{session._count.papers === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  {session._count.candidates} candidate
                  {session._count.candidates === 1 ? "" : "s"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
