import "server-only";

import type { SelectOption } from "@/components/select-search";
import { db } from "@/lib/db";
import { listName } from "@/lib/utils";

/**
 * The two "about" pickers, loaded once for whichever editor is rendering.
 *
 * Shared between the new-document page and the edit page so the two cannot
 * offer different people — and so the queries live somewhere other than in
 * both of them.
 */
export async function peopleForPickers(): Promise<{
  staff: SelectOption[];
  students: SelectOption[];
}> {
  const [staff, students] = await Promise.all([
    db.staff.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, otherNames: true, jobTitle: true },
    }),
    db.student.findMany({
      where: { status: "ENROLLED" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 2000,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        admissionNo: true,
      },
    }),
  ]);

  return {
    staff: staff.map((person) => ({
      value: person.id,
      label: listName(person),
      description: person.jobTitle ?? undefined,
    })),
    students: students.map((student) => ({
      value: student.id,
      label: listName(student),
      description: student.admissionNo,
    })),
  };
}
