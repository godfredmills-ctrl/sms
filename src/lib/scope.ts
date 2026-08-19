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
/**
 * The Prisma filter for "an offering this person teaches".
 *
 * A subject offering has a lead teacher and a list of co-teachers, and until
 * this existed only the lead counted anywhere: six separate queries each
 * wrote `teacherId: staffId` by hand, so a lab assistant or a co-teacher
 * recorded on the offering was locked out of the very class they teach —
 * no error, just an empty gradebook.
 *
 * Every query that means "your classes" goes through here, so adding a
 * third kind of teacher later changes one line rather than six.
 */
export function taughtBy(staffId: string) {
  return {
    OR: [{ teacherId: staffId }, { coTeacherIds: { has: staffId } }],
  };
}

/**
 * The same question as `taughtBy`, asked of a row already in memory.
 *
 * Kept beside it so the two cannot drift: a list page that filters in
 * JavaScript and an action that filters in SQL must agree about who teaches
 * a class, or the list refuses what the action permits.
 */
export function teaches(
  offering: { teacherId: string | null; coTeacherIds: string[] } | null | undefined,
  staffId: string | null | undefined,
): boolean {
  if (!offering || !staffId) return false;
  return offering.teacherId === staffId || offering.coTeacherIds.includes(staffId);
}

export async function ownSectionIdsFor(staffId: string | null | undefined): Promise<string[]> {
  if (!staffId) return [];

  const [taught, registers] = await Promise.all([
    db.subjectOffering.findMany({
      where: taughtBy(staffId),
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
    select: {
      teacherId: true,
      coTeacherIds: true,
      classSection: { select: { formTeacherId: true } },
    },
  });
  if (!offering) return "That subject does not exist.";

  const mine =
    offering.teacherId === user.staffId ||
    offering.coTeacherIds.includes(user.staffId) ||
    offering.classSection.formTeacherId === user.staffId;

  return mine ? null : "That subject is taught by someone else.";
}

/**
 * Everything in the academic and learning modules hangs off a subject
 * offering: a course belongs to one, a quiz to a course, an assessment to an
 * offering, a report card to a class. So each of these resolves its entity
 * back to that offering and asks the one question.
 *
 * They exist because the alternative — an ownership check written afresh in
 * each of thirty server actions — is how twenty-five of them ended up with
 * no check at all.
 */

export async function courseOutOfScope(
  user: { staffId?: string | null; permissions: Set<string> | string[] },
  courseId: string,
): Promise<string | null> {
  if (seesWholeSchool(user)) return null;

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { offeringId: true },
  });
  if (!course) return "That course does not exist.";
  // A course with no offering belongs to nobody in particular; only the
  // office may touch it.
  if (!course.offeringId) return "That course is not attached to a class of yours.";

  return offeringOutOfScope(user, course.offeringId);
}

export async function quizOutOfScope(
  user: { staffId?: string | null; permissions: Set<string> | string[] },
  quizId: string,
): Promise<string | null> {
  if (seesWholeSchool(user)) return null;

  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { courseId: true },
  });
  if (!quiz) return "That quiz does not exist.";
  return courseOutOfScope(user, quiz.courseId);
}

export async function assessmentOutOfScope(
  user: { staffId?: string | null; permissions: Set<string> | string[] },
  assessmentId: string,
): Promise<string | null> {
  if (seesWholeSchool(user)) return null;

  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    select: { offeringId: true },
  });
  if (!assessment) return "That assessment does not exist.";
  return offeringOutOfScope(user, assessment.offeringId);
}

/**
 * A report card belongs to a class, and to the form teacher who writes its
 * remarks — not to every teacher who happens to hold the permission to
 * generate one.
 */
export async function reportCardOutOfScope(
  user: { staffId?: string | null; permissions: Set<string> | string[] },
  reportCardId: string,
): Promise<string | null> {
  if (seesWholeSchool(user)) return null;

  const card = await db.reportCard.findUnique({
    where: { id: reportCardId },
    select: { studentId: true },
  });
  if (!card) return "That report card does not exist.";
  return studentOutOfScope(user, card.studentId);
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
