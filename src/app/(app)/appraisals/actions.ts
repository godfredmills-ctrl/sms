"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize, requireUser, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  CRITERIA,
  isRating,
  refusal,
  targetProblem,
  type Role,
  type Score,
  type Status,
  type Target,
} from "@/lib/appraisal-rules";
import { factsFor } from "@/lib/appraisals";
import { evidence } from "@/lib/appraisal-rules";
import { notifyUsers } from "@/lib/messaging";

export type AppraisalState = {
  ok?: boolean;
  error?: string;
  message?: string;
  id?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * What this person is to this appraisal.
 *
 * Both is possible and refused: an appraisal with the same person on both
 * sides is caught by the rules module before anything else, and by a CHECK
 * underneath that.
 */
function rolesFor(
  user: { staffId: string | null },
  appraisal: { staffId: string; appraiserId: string },
): Role[] {
  const roles: Role[] = [];
  if (user.staffId && user.staffId === appraisal.staffId) roles.push("appraisee");
  if (user.staffId && user.staffId === appraisal.appraiserId) roles.push("appraiser");
  return roles;
}

/** Whether this person may look at this appraisal at all. */
async function readable(id: string) {
  const user = await requireUser();

  const appraisal = await db.appraisal.findUnique({
    where: { id },
    include: {
      staff: { select: { id: true, firstName: true, lastName: true, title: true, userId: true } },
      appraiser: { select: { id: true, firstName: true, lastName: true, title: true, userId: true } },
      academicYear: { select: { id: true, name: true, startDate: true, endDate: true } },
      term: { select: { name: true, startDate: true, endDate: true } },
      scores: true,
      targets: { orderBy: { sortKey: "asc" } },
    },
  });
  if (!appraisal) return { user, appraisal: null, roles: [] as Role[] };

  const roles = rolesFor(user, appraisal);
  const mayRead = roles.length > 0 || userCan(user, "staff.appraisal.read");

  return { user, appraisal: mayRead ? appraisal : null, roles };
}

/**
 * Open one for a member of staff.
 *
 * The appraiser is chosen here rather than derived from a reporting line,
 * because this system does not hold one and inventing it would put the wrong
 * name on a personnel record. Whoever manages staff decides.
 */
export async function openAppraisalAction(
  _previous: AppraisalState,
  formData: FormData,
): Promise<AppraisalState> {
  const user = await authorize("staff.appraisal.manage");

  const staffId = text(formData, "staffId");
  const appraiserId = text(formData, "appraiserId");
  const academicYearId = text(formData, "academicYearId");
  const termId = text(formData, "termId") || null;

  if (!staffId) return { error: "Whose appraisal?" };
  if (!appraiserId) return { error: "Who is appraising them?" };
  if (!academicYearId) return { error: "For which year?" };

  if (staffId === appraiserId) {
    return {
      error:
        "An appraisal cannot have the same person on both sides of it. Choose somebody else to appraise them.",
    };
  }

  let created: { id: string };
  try {
    created = await db.appraisal.create({
      data: {
        staffId,
        appraiserId,
        academicYearId,
        termId,
        // Every heading, unrated. Created up front so the appraiser opens a
        // form rather than a blank page, and so a heading cannot be quietly
        // omitted by never being created.
        scores: { create: CRITERIA.map((criterion) => ({ criterion: criterion.key })) },
      },
      select: { id: true },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return {
        error:
          "That member of staff already has an appraisal open for this period. One per person per period, so that there is never a question of which one counts.",
      };
    }
    throw error;
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "staff.appraisal.open",
      entity: "Appraisal",
      entityId: created.id,
      summary: "Appraisal opened",
    },
  });

  revalidatePath("/appraisals");
  redirect(`/appraisals/${created.id}`);
}

/** The appraisee's own half, saved as often as they like. */
export async function saveSelfAssessmentAction(
  _previous: AppraisalState,
  formData: FormData,
): Promise<AppraisalState> {
  const id = text(formData, "id");
  const { user, appraisal } = await readable(id);
  if (!appraisal) return { error: "That appraisal was not found." };

  if (user.staffId !== appraisal.staffId) {
    return { error: "A self-assessment is written by the person being appraised." };
  }
  if (appraisal.status !== "DRAFT") {
    return {
      error: "It has been sent. What you wrote stands as it was when the appraiser read it.",
    };
  }

  await db.appraisal.update({
    where: { id },
    data: { selfAssessment: text(formData, "selfAssessment") || null },
  });

  revalidatePath(`/appraisals/${id}`);
  return { ok: true, id, message: "Saved. Only you can see it until you send it." };
}

/**
 * The appraiser's half: the ratings, the comment and the targets.
 *
 * Saved without moving the appraisal along, so somebody can write it over two
 * sittings. Recording it is a separate step, because that is the step the
 * appraisee is then asked to sign.
 */
export async function saveAppraisalAction(
  _previous: AppraisalState,
  formData: FormData,
): Promise<AppraisalState> {
  const id = text(formData, "id");
  const { user, appraisal } = await readable(id);
  if (!appraisal) return { error: "That appraisal was not found." };

  if (user.staffId !== appraisal.appraiserId) {
    return { error: "Only the appraiser writes this half." };
  }
  if (appraisal.status === "AGREED") {
    return { error: "It has been agreed. Reopening a signed appraisal is not something to do quietly." };
  }

  const scores: Score[] = [];
  for (const criterion of CRITERIA) {
    const raw = text(formData, `rating:${criterion.key}`);
    const rating = raw === "" ? null : Number(raw);
    if (rating !== null && !isRating(rating)) {
      return { error: `${criterion.label}: that is not a rating on the scale.` };
    }
    scores.push({ criterion: criterion.key, rating });
  }

  const targets: Array<Target & { reviewBy: Date | null }> = [];
  const descriptions = formData.getAll("targetDescription").map(String);
  const reviews = formData.getAll("targetReviewBy").map(String);

  for (let index = 0; index < descriptions.length; index += 1) {
    const description = (descriptions[index] ?? "").trim();
    if (!description) continue;

    const problem = targetProblem({ description });
    if (problem) return { error: problem };

    const raw = (reviews[index] ?? "").trim();
    // Local midnight from the parts, as everywhere else a date-only value is
    // read: the constructor would take it as UTC and shift it west of here.
    const reviewBy = raw ? new Date(`${raw}T00:00:00`) : null;
    if (reviewBy && Number.isNaN(reviewBy.getTime())) {
      return { error: "That review date is not valid." };
    }

    targets.push({ description, reviewBy });
  }

  await db.$transaction([
    ...scores.map((score) =>
      db.appraisalScore.update({
        where: {
          appraisalId_criterion: { appraisalId: id, criterion: score.criterion },
        },
        data: {
          rating: score.rating,
          note: text(formData, `note:${score.criterion}`) || null,
        },
      }),
    ),
    db.appraisal.update({
      where: { id },
      data: { appraiserComment: text(formData, "appraiserComment") || null },
    }),
    db.appraisalTarget.deleteMany({ where: { appraisalId: id } }),
    ...targets.map((target, index) =>
      db.appraisalTarget.create({
        data: {
          appraisalId: id,
          description: target.description,
          reviewBy: target.reviewBy,
          sortKey: index,
        },
      }),
    ),
  ]);

  revalidatePath(`/appraisals/${id}`);
  return { ok: true, id, message: "Saved. Nothing has been sent to them yet." };
}

/**
 * Move it along: send, record, agree, disagree.
 *
 * Every refusal comes from the rules module, which the screen reads to decide
 * which buttons to draw. The two that matter are that nobody appraises
 * themselves and that only the appraisee signs.
 */
export async function moveAppraisalAction(
  _previous: AppraisalState,
  formData: FormData,
): Promise<AppraisalState> {
  const id = text(formData, "id");
  const to = text(formData, "to") as Status;
  const note = text(formData, "note");

  const { user, appraisal, roles } = await readable(id);
  if (!appraisal) return { error: "That appraisal was not found." };

  const refused = refusal({
    from: appraisal.status,
    to,
    roles,
    own: user.staffId === appraisal.staffId,
    selfAppraisal: appraisal.staffId === appraisal.appraiserId,
    scores: appraisal.scores.map((score) => ({
      criterion: score.criterion,
      rating: score.rating,
    })),
    targets: appraisal.targets.map((target) => ({ description: target.description })),
    // The comment the appraisal already carries is what is being sent; the box
    // on this step is for the appraisee's response.
    note: to === "APPRAISED" ? (appraisal.appraiserComment ?? "") : note,
  });
  if (refused) return { error: refused };

  const now = new Date();
  const data: Record<string, unknown> = { status: to };

  if (to === "SELF_ASSESSED") {
    if (!appraisal.selfAssessment?.trim()) {
      return { error: "Write something first. An empty self-assessment says nothing to the person reading it." };
    }
    data.selfAssessedAt = now;
  }

  if (to === "APPRAISED") {
    data.appraisedAt = now;

    /*
     * The facts as they stood on the day.
     *
     * Snapshotted rather than computed on every view, because they keep
     * moving: notes are handed in late, more cover is taken, and a year later
     * the figures beneath a signed appraisal would no longer be the figures
     * the person signed against.
     */
    const period = appraisal.term
      ? { from: appraisal.term.startDate, to: appraisal.term.endDate }
      : { from: appraisal.academicYear.startDate, to: appraisal.academicYear.endDate };

    const facts = await factsFor(appraisal.staffId, {
      ...period,
      academicYearId: appraisal.academicYearId,
    });

    data.evidence = evidence(
      facts,
      appraisal.term?.name ?? appraisal.academicYear.name,
    ) as never;
  }

  if (to === "AGREED" || to === "DISPUTED") {
    data.response = note || null;
    data.respondedAt = now;
  }

  await db.appraisal.update({ where: { id }, data });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: `staff.appraisal.${to.toLowerCase()}`,
      entity: "Appraisal",
      entityId: id,
      summary: `${appraisal.staff.firstName} ${appraisal.staff.lastName}: ${to.toLowerCase()}`,
    },
  });

  // Told at the point it becomes theirs to do something about.
  const tell =
    to === "SELF_ASSESSED"
      ? appraisal.appraiser.userId
      : to === "APPRAISED" || to === "AGREED" || to === "DISPUTED"
        ? to === "APPRAISED"
          ? appraisal.staff.userId
          : appraisal.appraiser.userId
        : null;

  if (tell) {
    await notifyUsers([tell], {
      title:
        to === "SELF_ASSESSED"
          ? "A self-assessment is waiting for you"
          : to === "APPRAISED"
            ? "Your appraisal is ready to read"
            : to === "AGREED"
              ? "An appraisal has been agreed"
              : "An appraisal has been disputed",
      category: "STAFF",
      url: `/appraisals/${id}`,
    }).catch(() => undefined);
  }

  revalidatePath("/appraisals");
  revalidatePath(`/appraisals/${id}`);

  const said =
    to === "SELF_ASSESSED"
      ? "Sent. Your appraiser can read it now, and you cannot edit it."
      : to === "APPRAISED"
        ? "Recorded. They will be asked to read it and say whether they agree."
        : to === "AGREED"
          ? "Agreed, and signed by you."
          : to === "DISPUTED"
            ? "Recorded. Your words stand beside the appraisal on the file."
            : "Done.";

  return { ok: true, id, message: said };
}
