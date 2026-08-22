import type { Metadata } from "next";

import type { SelectOption } from "@/components/select-search";
import { PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { EXEAT_TRANSITIONS, type ExeatStatusValue } from "@/lib/boarding-rules";
import { db } from "@/lib/db";
import { formatDateTime, listName } from "@/lib/utils";

import { ExeatDesk, type ExeatRow } from "./exeat-desk";

export const metadata: Metadata = { title: "Leave-out" };
export const dynamic = "force-dynamic";

export default async function ExeatPage() {
  const user = await requirePermission(["boarding.read", "boarding.manage", "boarding.gate"]);

  const canApprove = userCan(user, "boarding.exeat.approve");
  const canGate = userCan(user, "boarding.gate");
  const canRequest = userCan(user, "boarding.exeat.request");

  const [exeats, boarders] = await Promise.all([
    db.boardingExeat.findMany({
      // Everything open, and a tail of what has closed — enough to answer "did
      // she come back on Sunday" without loading a term of history.
      orderBy: [{ status: "asc" }, { dueBackAt: "asc" }],
      take: 300,
      select: {
        id: true,
        status: true,
        reason: true,
        destination: true,
        departsAt: true,
        dueBackAt: true,
        releasedToName: true,
        releasedToPhone: true,
        relationship: true,
        signedOutAt: true,
        signedInAt: true,
        decisionNote: true,
        house: { select: { name: true } },
        student: {
          select: {
            firstName: true,
            lastName: true,
            otherNames: true,
            admissionNo: true,
          },
        },
      },
    }),
    canRequest
      ? db.student.findMany({
          where: { status: "ENROLLED", isBoarder: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: 2000,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            otherNames: true,
            admissionNo: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const rows: ExeatRow[] = exeats.map((exeat) => ({
    id: exeat.id,
    status: exeat.status,
    studentName: listName(exeat.student),
    admissionNo: exeat.student.admissionNo,
    houseName: exeat.house?.name ?? null,
    reason: exeat.reason,
    destination: exeat.destination,
    departsAt: formatDateTime(exeat.departsAt),
    dueBackAt: formatDateTime(exeat.dueBackAt),
    releasedToName: exeat.releasedToName,
    releasedToPhone: exeat.releasedToPhone,
    relationship: exeat.relationship,
    signedOutAt: exeat.signedOutAt ? formatDateTime(exeat.signedOutAt) : null,
    signedInAt: exeat.signedInAt ? formatDateTime(exeat.signedInAt) : null,
    decisionNote: exeat.decisionNote,
    // From the same table the action enforces, filtered by what this person
    // may actually do — so a button that appears is a button that works.
    allowed: (EXEAT_TRANSITIONS[exeat.status as ExeatStatusValue] ?? []).filter((next) =>
      next === "OUT" || next === "RETURNED" ? canGate : canApprove,
    ),
  }));

  const students: SelectOption[] = boarders.map((student) => ({
    value: student.id,
    label: listName(student),
    description: student.admissionNo,
  }));

  return (
    <>
      <PageHeader
        title="Leave-out"
        description="A boarder off the compound is signed out to a named adult and signed back in. This is what the school has when somebody asks where a child is."
      />
      <ExeatDesk
        rows={rows}
        students={students}
        canRequest={canRequest}
        // The server's clock, so "overdue" does not depend on whose phone it is.
        now={new Date().toISOString()}
      />
    </>
  );
}
