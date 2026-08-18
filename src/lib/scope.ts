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

/**
 * Refuses a write to a student outside the actor's own classes.
 *
 * Returns a message when the actor may not touch this child, or null when
 * they may. The check is here rather than repeated in each action because
 * "your classes" must mean one thing: the students list, the discipline
 * desk and the student write path all narrow the same way, and a fourth
 * place that narrows slightly differently is how a permission quietly
 * becomes school-wide.
 *
 * A holder of student.read (the registrar, the head, the office) is not
 * narrowed at all — their permission is the school.
 */
export async function studentOutOfScope(
  user: { staffId?: string | null; permissions: Set<string> | string[] },
  studentId: string,
): Promise<string | null> {
  const held = user.permissions instanceof Set ? user.permissions : new Set(user.permissions);
  if (held.has("student.read") || held.has("super_admin")) return null;

  const own = await ownSectionIdsFor(user.staffId);
  if (!own.length) {
    return "You have no classes of your own, so there is no student here you can change.";
  }

  const enrolment = await db.enrollment.findFirst({
    where: { studentId, status: "ACTIVE", classSectionId: { in: own } },
    select: { id: true },
  });

  return enrolment
    ? null
    : "This student is outside your classes — the office keeps their record.";
}
