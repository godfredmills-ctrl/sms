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

/**
 * Whether this person's remit is the whole school rather than their own
 * classes.
 *
 * This exists because the codebase kept asking that question with whatever
 * permission was nearest, and got it wrong the same way twice: the
 * attendance page asked `attendance.report` and the course list asked
 * `lms.course.read`, both of which every teacher holds — so "a teacher sees
 * their own classes" was a comment rather than a behaviour.
 *
 * `student.read` is the honest signal. It is the office's permission: the
 * head, the registrar, the bursar and the secretary hold it, and a teacher
 * is given `student.read.own` precisely so that they do not. One question,
 * one answer, everywhere.
 */
export function seesWholeSchool(user: {
  permissions: Set<string> | string[];
}): boolean {
  const held = user.permissions instanceof Set ? user.permissions : new Set(user.permissions);
  return held.has("student.read");
}

/**
 * Refuses a class the teacher has nothing to do with.
 *
 * "Their own" means the same here as everywhere else: a class whose register
 * they own, or one they teach a subject in.
 */
export async function sectionOutOfScope(
  user: { staffId?: string | null; permissions: Set<string> | string[] },
  classSectionId: string,
): Promise<string | null> {
  if (seesWholeSchool(user)) return null;

  const own = await ownSectionIdsFor(user.staffId);
  return own.includes(classSectionId) ? null : "That class is not one of yours.";
}

/**
 * Refuses a subject offering taught by somebody else.
 *
 * Narrower than the class check on purpose: a teacher who takes JHS 2 for
 * English owns the English register and the English marks for that class,
 * not its Mathematics. The form teacher of the class is the exception —
 * the whole register is theirs.
 */
export async function offeringOutOfScope(
  user: { staffId?: string | null; permissions: Set<string> | string[] },
  offeringId: string,
): Promise<string | null> {
  if (seesWholeSchool(user)) return null;
  if (!user.staffId) return "You have no staff record, so you teach nothing here.";

  const offering = await db.subjectOffering.findUnique({
    where: { id: offeringId },
    select: { teacherId: true, classSection: { select: { formTeacherId: true } } },
  });
  if (!offering) return "That subject does not exist.";

  const mine =
    offering.teacherId === user.staffId ||
    offering.classSection.formTeacherId === user.staffId;

  return mine ? null : "That subject is taught by someone else.";
}

/**
 * The Prisma filter for "classes this person may see".
 *
 * A where-fragment rather than a post-filter, so a listing narrows in the
 * query — the difference between a teacher's page and a teacher's page that
 * still loaded every child in the school before hiding them.
 */
export async function classSectionScopeFilter(user: {
  staffId?: string | null;
  permissions: Set<string> | string[];
}): Promise<{ id?: { in: string[] } }> {
  if (seesWholeSchool(user)) return {};
  const own = await ownSectionIdsFor(user.staffId);
  return { id: { in: own } };
}
