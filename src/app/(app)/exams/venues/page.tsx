import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";

import { VenueEditor, type VenueRow } from "./venue-editor";

export const metadata: Metadata = { title: "Examination halls" };
export const dynamic = "force-dynamic";

export default async function VenuesPage() {
  const user = await requirePermission("assessment.exam.manage");

  const venues = await db.examVenue.findMany({
    orderBy: [{ active: "desc" }, { capacity: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      capacity: true,
      notes: true,
      active: true,
      seats: { distinct: ["paperId"], select: { paperId: true } },
    },
  });

  const rows: VenueRow[] = venues.map(({ seats, ...venue }) => ({
    ...venue,
    papers: seats.length,
  }));

  return (
    <>
      <PageHeader
        title="Examination halls"
        description="Where candidates sit, and how many each room holds with the desks spaced for an examination."
      />
      <VenueEditor venues={rows} canManage={userCan(user, "assessment.exam.manage")} />
    </>
  );
}
