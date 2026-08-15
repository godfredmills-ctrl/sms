import "server-only";

import { db } from "@/lib/db";
import { toNumber } from "@/lib/utils";

/**
 * Quiz marking.
 *
 * Everything except ESSAY is marked automatically the moment a quiz is
 * submitted. Essays are left unmarked and pull the attempt back to
 * "SUBMITTED", because a partly-automatic score shown as a final one is worse
 * than no score: a student reads 4/10 on a paper the teacher has not looked at
 * yet and concludes they failed.
 */

export type SubmittedAnswer = {
  questionId: string;
  optionId?: string | null;
  optionIds?: string[];
  textAnswer?: string | null;
};

/** Normalises a free-text answer so casing and stray spaces do not cost a mark. */
function normalise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?'"]/g, "");
}

export type MarkedAnswer = {
  questionId: string;
  optionId: string | null;
  optionIds: string[];
  textAnswer: string | null;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
};

export type MarkResult = {
  answers: MarkedAnswer[];
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  /** True when at least one question needs a human. */
  needsReview: boolean;
};

export async function markAttempt(
  quizId: string,
  submitted: SubmittedAnswer[],
): Promise<MarkResult | null> {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      passMark: true,
      questions: {
        select: {
          id: true,
          type: true,
          points: true,
          acceptedAnswers: true,
          options: { select: { id: true, isCorrect: true } },
        },
      },
    },
  });

  if (!quiz) return null;

  const byQuestion = new Map(submitted.map((entry) => [entry.questionId, entry]));

  let score = 0;
  let maxScore = 0;
  let needsReview = false;

  const answers: MarkedAnswer[] = quiz.questions.map((question) => {
    const points = toNumber(question.points) ?? 1;
    maxScore += points;

    const given = byQuestion.get(question.id);
    const optionIds = given?.optionIds ?? [];
    const optionId = given?.optionId ?? null;
    const textAnswer = given?.textAnswer?.trim() || null;

    const base = {
      questionId: question.id,
      optionId,
      optionIds,
      textAnswer,
    };

    switch (question.type) {
      case "MULTIPLE_CHOICE":
      case "TRUE_FALSE": {
        const correct = question.options.find((option) => option.isCorrect);
        const isCorrect = Boolean(correct && optionId === correct.id);
        if (isCorrect) score += points;
        return { ...base, isCorrect, pointsAwarded: isCorrect ? points : 0 };
      }

      case "MULTIPLE_ANSWER": {
        // All-or-nothing. Partial credit on a multi-select rewards guessing
        // every box, which is the opposite of what the question is testing.
        const correctIds = question.options
          .filter((option) => option.isCorrect)
          .map((option) => option.id)
          .sort();
        const chosen = [...optionIds].sort();
        const isCorrect =
          correctIds.length > 0 &&
          correctIds.length === chosen.length &&
          correctIds.every((id, index) => id === chosen[index]);
        if (isCorrect) score += points;
        return { ...base, isCorrect, pointsAwarded: isCorrect ? points : 0 };
      }

      case "SHORT_ANSWER":
      case "FILL_BLANK": {
        // No accepted answers recorded means the teacher intends to mark it.
        if (!question.acceptedAnswers.length) {
          needsReview = true;
          return { ...base, isCorrect: null, pointsAwarded: null };
        }
        const isCorrect = Boolean(
          textAnswer &&
            question.acceptedAnswers.some(
              (accepted) => normalise(accepted) === normalise(textAnswer),
            ),
        );
        if (isCorrect) score += points;
        return { ...base, isCorrect, pointsAwarded: isCorrect ? points : 0 };
      }

      default: {
        // ESSAY and MATCHING always need a human.
        needsReview = true;
        return { ...base, isCorrect: null, pointsAwarded: null };
      }
    }
  });

  const percent = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;

  return {
    answers,
    score,
    maxScore,
    percent,
    passed: percent >= quiz.passMark,
    needsReview,
  };
}

/**
 * Whether a student may see the answers yet.
 *
 * NEVER and AFTER_CLOSE exist so a class taking the quiz at different times
 * cannot pass answers along. Honouring that is the difference between a quiz
 * and a worksheet.
 */
export function canRevealAnswers(
  quiz: { showAnswersAfter: string; closesAt: Date | null },
  attemptSubmitted: boolean,
): boolean {
  if (!attemptSubmitted) return false;

  switch (quiz.showAnswersAfter) {
    case "IMMEDIATELY":
      return true;
    case "AFTER_CLOSE":
      return Boolean(quiz.closesAt && quiz.closesAt < new Date());
    default:
      return false;
  }
}

/** Deterministic shuffle so a reload does not reorder a paper mid-attempt. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const scored = items.map((item, index) => {
    let hash = 0;
    const key = `${seed}:${index}`;
    for (let position = 0; position < key.length; position += 1) {
      hash = (hash * 31 + key.charCodeAt(position)) | 0;
    }
    return { item, sort: hash };
  });

  return scored.sort((a, b) => a.sort - b.sort).map((entry) => entry.item);
}
