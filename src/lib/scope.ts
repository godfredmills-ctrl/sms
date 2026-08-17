import { db } from "@/lib/db";

/**
 * The class sections that make up a staff member's "own classes" — the ones
 * they teach a subject in, plus the one whose register they own as form
 * teacher.
 *
 * This is the scope behind student.read.own, computed in one place so the
 * students list, the discipline desk and anything else that says "your
 * classes" cannot quietly mean different classes.
 */
export async function ownSectionIdsFor(staffId: string | null | undefined): Promise<string[]> {
  if (!staffId) return [];

  const [taught, registers] = await Promise.all([
    db.subjectOffering.findMany({
      where: { teacherId: staffId },
      select: { classSectionId: true },
      distinct: ["classSectionId"],
    }),
    db.classSection.findMany({
      where: { formTeacherId: staffId },
      select: { id: true },
    }),
  ]);

  return [
    ...new Set([
      ...taught.map((offering) => offering.classSectionId),
      ...registers.map((section) => section.id),
    ]),
  ];
}
