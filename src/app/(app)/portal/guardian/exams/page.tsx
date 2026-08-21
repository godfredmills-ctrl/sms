import type { Metadata } from "next";

import { ExamEntries } from "@/components/exam-entries";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { examsForStudents } from "@/lib/exam-portal";

import { NotLinked } from "../not-linked";
import { wardIdsFor } from "../wards";

export const metadata: Metadata = { title: "Examinations" };
export const dynamic = "force-dynamic";

/**
 * A parent's view of their own children's examinations.
 *
 * Scoped through wardIdsFor rather than on any id from the URL — a parent may
 * have several children, and an unscoped lookup would let any portal login
 * read any candidate's index number and seat by changing a number.
 */
export default async function GuardianExamsPage() {
  const user = await requireUser();
  if (!user.guardianId) return <NotLinked />;

  const wardIds = await wardIdsFor(user.guardianId);
  const entries = await examsForStudents(wardIds);

  return (
    <>
      <PageHeader
        title="Examinations"
        description="Index numbers, and where and when each paper is sat. The rules for the hall are at the foot of each timetable."
      />
      <ExamEntries entries={entries} showNames={wardIds.length > 1} />
    </>
  );
}
