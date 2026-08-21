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
 *
 * People who have left are here too. Filtering to current staff and enrolled
 * pupils excluded the very people most of these documents are about: a
 * reference is written for somebody who has left, a conduct letter after a
 * pupil has been withdrawn, a service certificate on the way out of the door.
 * The picker offered nobody, so the document was filed against nobody and the
 * link from that person's record to the letter about them never existed.
 * They are marked, and sorted below the people still here.
 */
export async function peopleForPickers(): Promise<{
  staff: SelectOption[];
  students: SelectOption[];
}> {
  const [staff, students] = await Promise.all([
    db.staff.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 2000,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        jobTitle: true,
        status: true,
      },
    }),
    db.student.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 5000,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        admissionNo: true,
        status: true,
      },
    }),
  ]);

  /** Still here first, then everyone else, each already in name order. */
  const currentFirst = (entries: { here: boolean; option: SelectOption }[]) =>
    [...entries.filter((entry) => entry.here), ...entries.filter((entry) => !entry.here)].map(
      (entry) => entry.option,
    );

  return {
    staff: currentFirst(
      staff.map((person) => {
        const here = person.status === "ACTIVE";
        return {
          here,
          option: {
            value: person.id,
            label: listName(person),
            description:
              [person.jobTitle, here ? null : "no longer on the staff"]
                .filter(Boolean)
                .join(" · ") || undefined,
          },
        };
      }),
    ),
    students: currentFirst(
      students.map((student) => {
        const here = student.status === "ENROLLED";
        return {
          here,
          option: {
            value: student.id,
            label: listName(student),
            description: here ? student.admissionNo : `${student.admissionNo} · has left`,
          },
        };
      }),
    ),
  };
}
