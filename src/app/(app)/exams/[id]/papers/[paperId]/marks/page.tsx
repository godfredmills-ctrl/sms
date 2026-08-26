import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, PageHeader, StatCard } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { paperMarkSheet } from "@/lib/exam-marks";
import { offeringOutOfScope } from "@/lib/scope";

import { MarkScripts, type ScriptRowView } from "./mark-scripts";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ paperId: string }>;
}): Promise<Metadata> {
  const { paperId } = await params;
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: { subject: { select: { name: true } } },
  });
  return { title: paper ? `Marking, ${paper.subject.name}` : "Marking" };
}

export default async function PaperMarksPage({
  params,
}: {
  params: Promise<{ id: string; paperId: string }>;
}) {
  const user = await requirePermission(["assessment.grade", "assessment.exam.marks"]);
  const { id, paperId } = await params;

  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: {
      id: true,
      sessionId: true,
      title: true,
      maxMarks: true,
      subject: { select: { name: true } },
      classLevel: { select: { name: true } },
      session: {
        select: { id: true, name: true, term: { select: { isLocked: true } } },
      },
      assessments: {
        select: { id: true, maxScore: true, isPublished: true, isLocked: true },
      },
    },
  });
  if (!paper || paper.sessionId !== id) notFound();

  const rows = await paperMarkSheet(paperId);

  // Which classes are this person's. A holder of exam.marks marks the whole
  // paper; everybody else marks their own classes, and the rows that are not
  // theirs are shown greyed rather than hidden — a marker holding half the
  // pile needs to know the other half exists.
  const wholePaper = userCan(user, "assessment.exam.marks");
  const mine = new Set<string>();
  if (!wholePaper) {
    for (const offeringId of new Set(
      rows.map((row) => row.offeringId).filter((value): value is string => Boolean(value)),
    )) {
      if (!(await offeringOutOfScope(user, offeringId))) mine.add(offeringId);
    }
  }

  // A teacher with no class in this paper has no business on this page at all.
  // assessment.grade is held by every teacher in the school, so gating on it
  // alone let any of them open any paper by its id and read a whole year
  // group's names and index numbers — the same mistake the hall list and the
  // register were pulled back from, made again one directory along.
  if (!wholePaper && mine.size === 0) notFound();

  const view: ScriptRowView[] = rows.map((row) => ({
    candidateId: row.candidateId,
    candidateNo: row.candidateNo,
    // And a name only where the class is theirs. The rest of the sheet is
    // there so a marker knows how much of the pile is not theirs; it does not
    // need to say who those candidates are, and "Show names" would reveal them.
    studentName:
      wholePaper || (row.offeringId && mine.has(row.offeringId)) ? row.studentName : "",
    seatNo: row.seatNo,
    venueName: row.venueName,
    seatStatus: row.seatStatus,
    seatRemark: row.seatRemark,
    enteredSection: row.enteredSection,
    marksSection: row.marksSection,
    score: row.score,
    blockedReason: row.blockedReason,
    mine: wholePaper || Boolean(row.offeringId && mine.has(row.offeringId)),
  }));

  const generated = paper.assessments.length > 0;
  const absent = rows.filter((row) => row.seatStatus === "ABSENT").length;
  const marked = rows.filter((row) => row.score !== null).length;
  const published = paper.assessments.some((entry) => entry.isPublished);
  const locked =
    Boolean(paper.session.term?.isLocked) ||
    paper.assessments.some((entry) => entry.isLocked);

  return (
    <div>
      <PageHeader
        title={`Marking, ${paper.subject.name}${paper.title ? ` ${paper.title}` : ""}`}
        description={`${paper.classLevel.name}  ·  scripts in seat order, by index number. Marks land in each candidate's own class mark sheet.`}
        breadcrumb={
          <>
            <Link href="/exams" className="hover:text-[var(--text)]">
              Examinations
            </Link>
            {" / "}
            <Link href={`/exams/${paper.session.id}`} className="hover:text-[var(--text)]">
              {paper.session.name}
            </Link>
            {" / "}
            <Link
              href={`/exams/${paper.session.id}/papers/${paper.id}`}
              className="hover:text-[var(--text)]"
            >
              {paper.subject.name}
            </Link>
          </>
        }
      />

      {!generated ? (
        <Alert tone="warning" title="No mark sheets yet">
          The columns these marks go into have not been created. Generate them from the
          paper page first: one per class sitting this paper.
        </Alert>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Scripts" value={String(rows.length - absent)} tone="neutral" />
            <StatCard
              label="Marked"
              value={String(marked)}
              hint={`${rows.length - absent - marked} to go`}
              tone={marked >= rows.length - absent ? "success" : "warning"}
            />
            <StatCard
              label="Absent"
              value={String(absent)}
              hint="From the hall register"
              tone={absent ? "warning" : "neutral"}
            />
            <StatCard
              label="Mark sheets"
              value={String(paper.assessments.length)}
              hint={published ? "Some already published" : "Not published yet"}
              tone={published ? "info" : "neutral"}
            />
          </div>

          {locked ? (
            <Alert tone="warning" className="mb-4">
              This term or these mark sheets are locked, so nothing can be changed here.
            </Alert>
          ) : null}

          <MarkScripts
            paperId={paper.id}
            // The assessment's maximum, not the paper's — that is what the
            // mark is divided by, and the header must promise what the server
            // will accept.
            maxMarks={Number(paper.assessments[0]?.maxScore ?? paper.maxMarks ?? 100)}
            rows={view}
            readOnly={locked}
          />
        </>
      )}
    </div>
  );
}
