"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { quizOutOfScope, seesWholeSchool } from "@/lib/scope";
import { db } from "@/lib/db";

import { parseQuestionInput } from "../question-input";

export type BankState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Files a question in the bank — a QuizQuestion with no quiz, shelved by
 * subject. Written once, reused every term, which is the whole argument for a
 * bank: the BECE-style questions a department refines over years should not
 * be retyped into every quiz that needs them.
 */
export async function saveBankQuestionAction(
  _previous: BankState,
  formData: FormData,
): Promise<BankState> {
  let user;
  try {
    user = await authorize("lms.quiz.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const parsed = parseQuestionInput(formData);
  if (!parsed) {
    return {
      error:
        "The question needs a prompt, and choice questions need an option marked correct with a leading *.",
    };
  }

  const subjectId = text(formData, "subjectId") || null;

  await db.quizQuestion.create({
    data: {
      quizId: null,
      subjectId,
      type: parsed.type as never,
      prompt: parsed.prompt,
      points: parsed.points,
      explanation: parsed.explanation,
      acceptedAnswers: parsed.acceptedAnswers,
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

  revalidatePath("/lms/bank");
  return { ok: true, message: "Filed in the bank." };
}

/** Deletes a bank question. Only bank questions — the where clause is the guard. */
export async function deleteBankQuestionAction(formData: FormData) {
  const user = await authorize("lms.quiz.manage");

  const id = text(formData, "id");
  if (!id) return;

  // The where clause is the authorisation: a bank question is deletable by
  // whoever wrote it, and by the office.
  await db.quizQuestion.deleteMany({
    where: {
      id,
      quizId: null,
      ...(seesWholeSchool(user) ? {} : { createdById: user.id }),
    },
  });
  revalidatePath("/lms/bank");
}

/**
 * Copies a bank question into a quiz.
 *
 * A copy, deliberately: quizzes edit and delete their questions freely, and a
 * shared row would mean one teacher's edit rewriting another teacher's quiz —
 * and the bank itself — without anyone being told. The price is that a bank
 * correction does not reach quizzes that copied earlier, which is the safer
 * direction to be wrong in.
 */
export async function addFromBankAction(formData: FormData) {
  const user = await authorize("lms.quiz.manage");

  const quizId = text(formData, "quizId");
  if (await quizOutOfScope(user, quizId)) return;
  const bankQuestionId = text(formData, "bankQuestionId");
  if (!quizId || !bankQuestionId) return;

  // Copied from the teacher's own shelf only — the bank is per teacher.
  const source = await db.quizQuestion.findFirst({
    where: {
      id: bankQuestionId,
      quizId: null,
      ...(seesWholeSchool(user) ? {} : { createdById: user.id }),
    },
    include: { options: { orderBy: { sortKey: "asc" } } },
  });
  if (!source) return;

  const last = await db.quizQuestion.findFirst({
    where: { quizId },
    orderBy: { sortKey: "desc" },
    select: { sortKey: true },
  });

  await db.quizQuestion.create({
    data: {
      quizId,
      type: source.type,
      prompt: source.prompt,
      imageUrl: source.imageUrl,
      points: source.points,
      explanation: source.explanation,
      acceptedAnswers: source.acceptedAnswers,
      sortKey: (last?.sortKey ?? 0) + 10,
      createdById: source.createdById,
      options: {
        create: source.options.map((option) => ({
          text: option.text,
          isCorrect: option.isCorrect,
          sortKey: option.sortKey,
        })),
      },
    },
  });

  revalidatePath(`/lms/quizzes/${quizId}`);
}
