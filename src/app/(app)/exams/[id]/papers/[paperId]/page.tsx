import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";

import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { candidatesForPaper, invigilates } from "@/lib/exams";
import { formatDate, fullName, listName } from "@/lib/utils";

import { Allocate, Invigilators, Register, type SeatRow } from "./seating";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ paperId: string }>;
}): Promise<Metadata> {
  const { paperId } = await params;
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: { subject: { select: { name: true } }, classLevel: { select: { name: true } } },
  });
  return {
    title: paper ? `${paper.subject.name} — ${paper.classLevel.name}` : "Paper",
  };
}

export default async function PaperPage({
  params,
}: {
  params: Promise<{ id: string; paperId: string }>;
}) {
  const user = await requirePermission([
    "assessment.exam.read",
    "assessment.exam.manage",
    "assessment.exam.attendance",
  ]);
  const { id, paperId } = await params;

  const canManage = userCan(user, "assessment.exam.manage");
  // Their own hall, or the whole school if they set the examinations up. The
  // register is every candidate's name, class and index number, and
  // exam.attendance is a permission every teacher holds — read as "any hall",
  // it would hand the year group's identity to a teacher who has nothing to do
  // with the paper. Same test the action applies, from the same function.
  const watching = await invigilates(user.staffId, paperId);
  const canSeeRegister = canManage || watching;
  const canMark = canSeeRegister && userCan(user, "assessment.exam.attendance");

  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: {
      id: true,
      sessionId: true,
      title: true,
      startsAt: true,
      durationMins: true,
      maxMarks: true,
      materials: true,
      notes: true,
      subject: { select: { name: true } },
      classLevel: { select: { name: true } },
      session: { select: { id: true, name: true, status: true } },
      invigilators: {
        orderBy: { role: "asc" },
        select: {
          staffId: true,
          role: true,
          staff: { select: { firstName: true, lastName: true, title: true } },
        },
      },
      seats: {
        orderBy: { seatNo: "asc" },
        select: {
          id: true,
          seatNo: true,
          status: true,
          remark: true,
          venue: { select: { name: true } },
          candidate: {
            select: {
              candidateNo: true,
              student: {
                select: { firstName: true, lastName: true, otherNames: true },
              },
              classSection: {
                select: { name: true, classLevel: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!paper || paper.sessionId !== id) notFound();

  const [venues, staff, entered] = await Promise.all([
    db.examVenue.findMany({
      where: { active: true },
      orderBy: [{ capacity: "desc" }, { name: "asc" }],
      select: { id: true, name: true, capacity: true },
    }),
    db.staff.findMany({
      where: { status: { in: ["ACTIVE", "PROBATION"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, title: true },
    }),
    candidatesForPaper(paperId),
  ]);

  const rows: SeatRow[] = paper.seats.map((seat) => ({
    id: seat.id,
    seatNo: seat.seatNo,
    venue: seat.venue?.name ?? null,
    candidateNo: seat.candidate.candidateNo,
    name: listName(seat.candidate.student),
    className: seat.candidate.classSection
      ? `${seat.candidate.classSection.classLevel.name} ${seat.candidate.classSection.name}`
      : "—",
    status: seat.status,
    remark: seat.remark,
  }));

  const present = rows.filter((row) => row.status === "PRESENT").length;
  const absent = rows.filter((row) => row.status === "ABSENT").length;
  // Once anybody has been marked the seating is a record rather than a plan.
  const locked = present + absent > 0;
  const missingSeats = entered.length - rows.length;

  const end = new Date(paper.startsAt.getTime() + paper.durationMins * 60_000);
  const time = (date: Date) =>
    date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  const halls = [...new Set(rows.map((row) => row.venue).filter(Boolean))] as string[];

  return (
    <div>
      <PageHeader
        title={`${paper.subject.name}${paper.title ? ` — ${paper.title}` : ""}`}
        description={`${paper.classLevel.name}  ·  ${formatDate(paper.startsAt, "long")}  ·  ${time(
          paper.startsAt,
        )} – ${time(end)}`}
        breadcrumb={
          <>
            <Link href="/exams" className="hover:text-[var(--text)]">
              Examinations
            </Link>
            {" / "}
            <Link href={`/exams/${paper.session.id}`} className="hover:text-[var(--text)]">
              {paper.session.name}
            </Link>
          </>
        }
        action={
          rows.length ? (
            <LinkButton
              href={`/api/exams/papers/${paper.id}/hall-list`}
              target="_blank"
              size="sm"
              variant="secondary"
            >
              <Printer className="size-4" />
              Hall list
            </LinkButton>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Entered"
          value={String(entered.length)}
          hint="Candidates taking this subject"
          tone="neutral"
        />
        <StatCard
          label="Seated"
          value={String(rows.length)}
          hint={
            missingSeats > 0
              ? `${missingSeats} with nowhere to sit`
              : halls.length
                ? halls.join(", ")
                : "Not laid out yet"
          }
          tone={missingSeats > 0 ? "danger" : rows.length ? "success" : "warning"}
        />
        <StatCard label="Present" value={String(present)} tone="success" />
        <StatCard
          label="Absent"
          value={String(absent)}
          hint={absent ? "Chase the missing scripts against these" : "None marked absent"}
          tone={absent ? "warning" : "neutral"}
        />
      </div>

      {missingSeats > 0 ? (
        <Alert tone="danger" title="Some candidates have no seat" className="mb-4">
          {missingSeats} candidate{missingSeats === 1 ? "" : "s"} entered for this paper
          {missingSeats === 1 ? " has" : " have"} nowhere to sit. Add another hall and lay
          it out again — a candidate with no seat is discovered in a doorway at nine in
          the morning otherwise.
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title="Hall register"
              description={
                canMark
                  ? "Marked in the hall. Two taps per candidate."
                  : "Who sat this paper and who did not."
              }
            />
            <CardBody>
              {canSeeRegister ? (
                <Register seats={rows} canMark={canMark} />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  You are not invigilating this paper. The register lists every
                  candidate by name, class and index number, so it is shown to the
                  invigilators and the exams office.
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="The paper" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Subject", value: paper.subject.name },
                  { label: "Year group", value: paper.classLevel.name },
                  { label: "Length", value: `${paper.durationMins} minutes` },
                  ...(paper.maxMarks
                    ? [{ label: "Out of", value: String(paper.maxMarks) }]
                    : []),
                  ...(paper.materials
                    ? [{ label: "What to bring", value: paper.materials }]
                    : []),
                  ...(paper.notes ? [{ label: "Notes", value: paper.notes }] : []),
                ]}
              />
            </CardBody>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader title="Seating" description="Halls fill in the order ticked." />
              <CardBody>
                <Allocate
                  paperId={paper.id}
                  venues={venues}
                  seated={rows.length}
                  locked={locked}
                />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Invigilation" />
            <CardBody>
              <Invigilators
                paperId={paper.id}
                canManage={canManage}
                staff={staff.map((person) => ({ id: person.id, name: fullName(person) }))}
                current={paper.invigilators.map((one) => ({
                  staffId: one.staffId,
                  role: one.role,
                  name: fullName(one.staff),
                }))}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
