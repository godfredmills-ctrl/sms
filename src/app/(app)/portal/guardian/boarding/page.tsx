import type { Metadata } from "next";

import { BoardingSummary } from "@/components/boarding-summary";
import { Alert, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { boardingFor } from "@/lib/boarding-portal";
import { db } from "@/lib/db";

import { NotLinked } from "../not-linked";
import { wardIdsFor } from "../wards";

export const metadata: Metadata = { title: "Boarding" };
export const dynamic = "force-dynamic";

/**
 * A parent's view of their own children's boarding.
 *
 * Through wardIdsFor, like every other guardian page here — a parent may have
 * several children, and an unscoped lookup would let any portal login read any
 * boarder's room by changing a number.
 */
export default async function GuardianBoardingPage() {
  const user = await requireUser();
  if (!user.guardianId) return <NotLinked />;

  const [wardIds, year] = await Promise.all([
    wardIdsFor(user.guardianId),
    db.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } }),
  ]);

  if (!year) {
    return (
      <>
        <PageHeader title="Boarding" description="Rooms and leave-out." />
        <Alert tone="info">Nothing is set up for this year yet.</Alert>
      </>
    );
  }

  const { beds, exeats } = await boardingFor(wardIds, year.id);

  return (
    <>
      <PageHeader
        title="Boarding"
        description="The house and room, the house parent's number, and every leave-out on the record."
      />
      <BoardingSummary
        beds={beds}
        exeats={exeats}
        showNames={wardIds.length > 1}
        now={new Date()}
      />
    </>
  );
}
