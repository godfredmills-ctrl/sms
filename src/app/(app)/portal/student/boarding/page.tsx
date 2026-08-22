import type { Metadata } from "next";

import { BoardingSummary } from "@/components/boarding-summary";
import { Alert, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { boardingFor } from "@/lib/boarding-portal";
import { db } from "@/lib/db";

import { NotLinked } from "../not-linked";

export const metadata: Metadata = { title: "My Boarding" };
export const dynamic = "force-dynamic";

/**
 * A boarder's own room and leave-out.
 *
 * Scoped on the signed-in pupil's own student id, never on boarding.read —
 * that is a staff permission covering every house in the school.
 */
export default async function StudentBoardingPage() {
  const user = await requireUser();
  if (!user.studentId) return <NotLinked />;

  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });

  if (!year) {
    return (
      <>
        <PageHeader title="My boarding" description="Where you sleep, and your leave-out." />
        <Alert tone="info">Nothing is set up for this year yet.</Alert>
      </>
    );
  }

  const { beds, exeats } = await boardingFor([user.studentId], year.id);

  return (
    <>
      <PageHeader
        title="My boarding"
        description="Your house and room, your house parent, and every leave-out on your record."
      />
      <BoardingSummary beds={beds} exeats={exeats} now={new Date()} />
    </>
  );
}
