import type { Metadata } from "next";

import { ExamEntries } from "@/components/exam-entries";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { examsForStudents } from "@/lib/exam-portal";

import { NotLinked } from "../not-linked";

export const metadata: Metadata = { title: "My Examinations" };
export const dynamic = "force-dynamic";

/**
 * A candidate's own index number, papers and seats.
 *
 * Scoped on the signed-in pupil's own student id, not on an examination
 * permission — exam.read covers the whole school, and a pupil reaching their
 * own timetable through it would be reaching everyone's.
 */
export default async function StudentExamsPage() {
  const user = await requireUser();
  if (!user.studentId) return <NotLinked />;

  const entries = await examsForStudents([user.studentId]);

  return (
    <>
      <PageHeader
        title="My examinations"
        description="Your index number, and where and when you sit each paper."
      />
      <ExamEntries entries={entries} />
    </>
  );
}
