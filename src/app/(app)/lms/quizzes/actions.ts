"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { courseOutOfScope, quizOutOfScope } from "@/lib/scope";
import { parseQuestionInput } from "../question-input";
import { db } from "@/lib/db";
import { markAttempt, type SubmittedAnswer } from "@/lib/quizzes";
import { toNumber } from "@/lib/utils";

export type QuizState = { ok?: boolean; error?: string; message?: string; id?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

// -----------------------------------------------------------------------------
// Authoring
// -----------------------------------------------------------------------------

export async function createQuizAction(
  _previous: QuizState,
  formData: FormData,
): Promise<QuizState> {
  let user;
  try {
    user = await authorize("lms.quiz.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const courseId = text(formData, "courseId");
  const title = text(formData, "title");
  if (!courseId || !title) return { error: "Give the quiz a title." };

  // A quiz is created inside somebody's course.
  const outOfScope = await courseOutOfScope(user, courseId);
  if (outOfScope) return { error: outOfScope };

  const opensAt = text(formData, "opensAt");
  const closesAt = text(formData, "closesAt");

  if (opensAt && closesAt && new Date(closesAt) <= new Date(opensAt)) {
    return { error: "The quiz must close after it opens." };
  }

  const quiz = await db.quiz.create({
    data: {
      courseId,
      title,
      description: text(formData, "description") || null,
      timeLimitMinutes: Number(text(formData, "timeLimitMinutes")) || null,
      maxAttempts: Math.max(1, Number(text(formData, "maxAttempts")) || 1),
      passMark: Math.min(100, Math.max(0, Number(text(formData, "passMark")) || 50)),
      shuffleQuestions: formData.get("shuffleQuestions") === "on",
      shuffleOptions: formData.get("shuffleOptions") === "on",
      showAnswersAfter: text(formData, "showAnswersAfter") || "AFTER_CLOSE",
      opensAt: opensAt ? new Date(opensAt) : null,
      closesAt: closesAt ? new Date(closesAt) : null,
    },
  });

  revalidatePath(`/lms/${courseId}`);
  return { ok: true, id: quiz.id, message: `Created "${title}". Add questions next.` };
}

/**
 * Plain-form wrapper. The course page posts straight to a server action rather
 * than through useActionState, so it needs a void-returning entry point.
 */
export async function createQuizFormAction(formData: FormData) {
  await createQuizAction({}, formData);
}

export async function addQuestionAction(formData: FormData) {
  const user = await authorize("lms.quiz.manage");

  const quizId = text(formData, "quizId");
  if (!quizId) return;
  if (await quizOutOfScope(user, quizId)) return;

  // Shared with the question bank, so the two cannot disagree about what an
  // asterisk means.
  const parsed = parseQuestionInput(formData);
  if (!parsed) return;

  const last = await db.quizQuestion.findFirst({
    where: { quizId },
    orderBy: { sortKey: "desc" },
    select: { sortKey: true },
  });

  await db.quizQuestion.create({
    data: {
      quizId,
      type: parsed.type as never,
      prompt: parsed.prompt,
      points: parsed.points,
      explanation: parsed.explanation,
      acceptedAnswers: parsed.acceptedAnswers,
      sortKey: (last?.sortKey ?? 0) + 10,
      createdById: user.id,
      ...(parsed.isChoice
        ? {
            options: {
              create: parsed.options.map((option, index) => ({
                text: option.text,
                isCorrect: option.isCorrect,
                sortKey: index,
              })),
            },
          }
        : {}),
    },
  });

  revalidatePath(`/lms/quizzes/${quizId}`);
}

export async function deleteQuestionAction(formData: FormData) {
  const user = await authorize("lms.quiz.manage");

  const id = text(formData, "id");
  const quizId = text(formData, "quizId");
  // Deleting a question takes every answer already marked against it.
  if (await quizOutOfScope(user, quizId)) return;
  if (!id) return;

  await db.quizQuestion.delete({ where: { id } });
  revalidatePath(`/lms/quizzes/${quizId}`);
}

export async function toggleQuizPublishedAction(formData: FormData) {
  const user = await authorize("lms.quiz.manage");

  const id = text(formData, "id");
  // Unpublishing a live quiz ends it for everyone sitting it.
  if (await quizOutOfScope(user, id)) return;
  if (!id) return;

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { isPublished: true, courseId: true, _count: { select: { questions: true } } },
  });
  if (!quiz) return;

  // A published quiz with no questions gives a student a blank paper they
  // cannot pass and a score of 0/0.
  if (!quiz.isPublished && quiz._count.questions === 0) return;

  await db.quiz.update({
    where: { id },
    data: { isPublished: !quiz.isPublished },
  });

  revalidatePath(`/lms/quizzes/${id}`);
  revalidatePath(`/lms/${quiz.courseId}`);
}

// -----------------------------------------------------------------------------
// Taking
// -----------------------------------------------------------------------------

export type AttemptState = { ok?: boolean; error?: string; attemptId?: string };

/**
 * Starts an attempt, or resumes the one already in progress.
 *
 * Resuming matters more than it looks: a student on a phone whose browser
 * reloads mid-quiz must not burn an attempt, and must not be handed a second
 * blank paper while the first is still open.
 */
export async function startAttemptAction(formData: FormData): Promise<AttemptState> {
  let user;
  try {
    user = await authorize("lms.submit");
  } catch (error) {
    return { error: (error as Error).message };
  }
  if (!user.studentId) return { error: "Only students can take a quiz." };

  const quizId = text(formData, "quizId");
  if (!quizId) return { error: "Missing quiz." };

  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      isPublished: true,
      opensAt: true,
      closesAt: true,
      maxAttempts: true,
      _count: { select: { questions: true } },
    },
  });

  if (!quiz || !quiz.isPublished) return { error: "That quiz is not available." };
  if (!quiz._count.questions) return { error: "That quiz has no questions yet." };

  const now = new Date();
  if (quiz.opensAt && now < quiz.opensAt) return { error: "The quiz has not opened yet." };
  if (quiz.closesAt && now > quiz.closesAt) return { error: "The quiz has closed." };

  const existing = await db.quizAttempt.findFirst({
    where: { quizId, studentId: user.studentId, status: "IN_PROGRESS" },
    orderBy: { attempt: "desc" },
    select: { id: true },
  });
  if (existing) return { ok: true, attemptId: existing.id };

  const used = await db.quizAttempt.count({
    where: { quizId, studentId: user.studentId },
  });
  if (used >= quiz.maxAttempts) {
    return { error: `You have used all ${quiz.maxAttempts} attempts.` };
  }

  const attempt = await db.quizAttempt.create({
    data: { quizId, studentId: user.studentId, attempt: used + 1 },
    select: { id: true },
  });

  return { ok: true, attemptId: attempt.id };
}

export async function submitAttemptAction(
  _previous: AttemptState,
  formData: FormData,
): Promise<AttemptState> {
  let user;
  try {
    user = await authorize("lms.submit");
  } catch (error) {
    return { error: (error as Error).message };
  }
  if (!user.studentId) return { error: "Only students can take a quiz." };

  const attemptId = text(formData, "attemptId");
  if (!attemptId) return { error: "Missing attempt." };

  const attempt = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      quizId: true,
      studentId: true,
      status: true,
      startedAt: true,
      quiz: { select: { timeLimitMinutes: true, closesAt: true, courseId: true } },
    },
  });

  // Ownership is checked against the session, not the form. An attempt id is
  // otherwise a way to submit answers into somebody else's paper.
  if (!attempt || attempt.studentId !== user.studentId) {
    return { error: "That attempt is not yours." };
  }
  if (attempt.status !== "IN_PROGRESS") {
    return { error: "That attempt has already been submitted." };
  }

  const answers: SubmittedAnswer[] = [];
  const questionIds = formData.getAll("questionId").map(String);

  for (const questionId of questionIds) {
    const optionIds = formData
      .getAll(`answer:${questionId}`)
      .map(String)
      .filter(Boolean);
    const textAnswer = String(formData.get(`text:${questionId}`) ?? "").trim();

    answers.push({
      questionId,
      optionId: optionIds[0] ?? null,
      optionIds,
      textAnswer: textAnswer || null,
    });
  }

  const marked = await markAttempt(attempt.quizId, answers);
  if (!marked) return { error: "Could not mark that attempt." };

  // Timed on the server, from the row's own startedAt. The countdown in the
  // page is a courtesy; a student who edits it, or whose tab sleeps, changes
  // nothing here.
  //
  // An over-run is recorded rather than rejected. Throwing away a finished
  // paper because it arrived forty seconds late punishes a slow connection as
  // if it were cheating, and the teacher can see the elapsed time and decide.
  const elapsedSeconds = Math.round(
    (Date.now() - attempt.startedAt.getTime()) / 1000,
  );

  await db.$transaction([
    db.quizAnswer.deleteMany({ where: { attemptId } }),
    db.quizAnswer.createMany({
      data: marked.answers.map((answer) => ({
        attemptId,
        questionId: answer.questionId,
        optionId: answer.optionId,
        optionIds: answer.optionIds,
        textAnswer: answer.textAnswer,
        isCorrect: answer.isCorrect,
        pointsAwarded: answer.pointsAwarded,
      })),
    }),
    db.quizAttempt.update({
      where: { id: attemptId },
      data: {
        submittedAt: new Date(),
        // Anything needing a human stays SUBMITTED. A partly-automatic score
        // presented as final reads as a failure the student did not earn.
        status: marked.needsReview ? "SUBMITTED" : "GRADED",
        score: marked.needsReview ? null : marked.score,
        maxScore: marked.maxScore,
        percent: marked.needsReview ? null : marked.percent,
        passed: marked.needsReview ? null : marked.passed,
        timeSpentSeconds: elapsedSeconds,
      },
    }),
  ]);

  revalidatePath(`/portal/student/quizzes/${attempt.quizId}`);
  revalidatePath(`/lms/quizzes/${attempt.quizId}`);

  return { ok: true, attemptId };
}

/** Marks the questions the machine could not: essays and matching. */
export async function markAnswerAction(formData: FormData) {
  const user = await authorize("lms.quiz.manage");

  const answerId = text(formData, "answerId");
  const quizId = text(formData, "quizId");
  if (!answerId) return;

  const answer = await db.quizAnswer.findUnique({
    where: { id: answerId },
    select: {
      attemptId: true,
      question: { select: { points: true } },
    },
  });
  if (!answer) return;

  const awarded = Number(text(formData, "points"));
  const max = toNumber(answer.question.points) ?? 1;
  if (!Number.isFinite(awarded) || awarded < 0 || awarded > max) return;

  await db.quizAnswer.update({
    where: { id: answerId },
    data: {
      pointsAwarded: awarded,
      isCorrect: awarded >= max,
      feedback: text(formData, "feedback") || null,
    },
  });

  // Re-total from the answers rather than adding a delta, so a corrected mark
  // cannot leave the attempt total drifting away from its parts.
  const answers = await db.quizAnswer.findMany({
    where: { attemptId: answer.attemptId },
    select: { pointsAwarded: true, question: { select: { points: true } } },
  });

  const outstanding = answers.some((entry) => entry.pointsAwarded === null);
  const score = answers.reduce(
    (sum, entry) => sum + (toNumber(entry.pointsAwarded) ?? 0),
    0,
  );
  const maxScore = answers.reduce(
    (sum, entry) => sum + (toNumber(entry.question.points) ?? 1),
    0,
  );
  const percent = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;

  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { passMark: true },
  });

  await db.quizAttempt.update({
    where: { id: answer.attemptId },
    data: {
      score,
      maxScore,
      percent,
      passed: percent >= (quiz?.passMark ?? 50),
      status: outstanding ? "SUBMITTED" : "GRADED",
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "lms.quiz.mark",
      entity: "QuizAttempt",
      entityId: answer.attemptId,
      summary: `Marked a response ${awarded}/${max}`,
    },
  });

  revalidatePath(`/lms/quizzes/${quizId}`);
}
