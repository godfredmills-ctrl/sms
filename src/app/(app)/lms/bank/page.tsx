import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Library, Trash2 } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { Pager, pageOf } from "@/components/pager";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission } from "@/lib/auth";
import { seesWholeSchool } from "@/lib/scope";
import { db } from "@/lib/db";
import { humanise, toNumber } from "@/lib/utils";

import { deleteBankQuestionAction } from "./actions";
import { BankQuestionForm } from "./bank-form";

export const metadata: Metadata = { title: "Question bank" };
export const dynamic = "force-dynamic";

const PER_PAGE = 20;

/**
 * The department's questions, written once and reused every term.
 *
 * Bank questions belong to a subject shelf rather than a quiz, and quizzes
 * take copies — so refining a quiz never rewrites the bank, and the bank
 * outlives any term's quizzes.
 */
export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("lms.quiz.manage");

  // A question bank is a teacher's own working notes — the questions they
  // have written and will reuse. Shared school-wide it becomes a place where
  // one teacher can read, copy and delete another's exam questions, which is
  // not a library, it is a leak. The office still sees the whole shelf.
  const mine = seesWholeSchool(user) ? {} : { createdById: user.id };

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);
  const rawSubject = Array.isArray(params.subject) ? params.subject[0] : params.subject;

  const subjects = await db.subject.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: { select: { bankQuestions: { where: { quizId: null, ...mine } } } },
    },
  });

  const subjectFilter = subjects.find((subject) => subject.id === rawSubject);

  const where = {
    quizId: null,
    ...mine,
    ...(subjectFilter ? { subjectId: subjectFilter.id } : {}),
  };

  const [questions, total, unshelved] = await Promise.all([
    db.quizQuestion.findMany({
      where,
      orderBy: { id: "desc" },
      skip,
      take,
      include: {
        subject: { select: { name: true } },
        options: { orderBy: { sortKey: "asc" } },
      },
    }),
    db.quizQuestion.count({ where }),
    db.quizQuestion.count({ where: { quizId: null, subjectId: null, ...mine } }),
  ]);

  const bankTotal =
    subjects.reduce((sum, subject) => sum + subject._count.bankQuestions, 0) +
    unshelved;

  return (
    <>
      <PageHeader
        title="Question bank"
        description="Written once, reused every term. Quizzes take copies, so editing a quiz never rewrites the bank."
        action={<RefreshButton />}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard
          label="Questions banked"
          value={bankTotal.toLocaleString()}
          tone="violet"
          icon={<Library className="size-4" />}
        />
        <StatCard
          label="Subject shelves in use"
          value={subjects.filter((subject) => subject._count.bankQuestions > 0).length}
          tone="info"
        />
        <StatCard
          label="Unshelved"
          value={unshelved}
          hint="No subject chosen"
          tone={unshelved ? "warning" : "success"}
        />
      </div>

      {/* Shelf filter */}
      <div className="scrollbar-none mb-4 flex gap-1.5 overflow-x-auto pb-1">
        <Link
          href="/lms/bank"
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            !subjectFilter
              ? "bg-[var(--primary)] text-[var(--primary-text)]"
              : "bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          All
        </Link>
        {subjects
          .filter((subject) => subject._count.bankQuestions > 0)
          .map((subject) => (
            <Link
              key={subject.id}
              href={`/lms/bank?subject=${subject.id}`}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                subjectFilter?.id === subject.id
                  ? "bg-[var(--primary)] text-[var(--primary-text)]"
                  : "bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {subject.name} · {subject._count.bankQuestions}
            </Link>
          ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {questions.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Library className="size-5" />}
                title="Nothing on this shelf"
                description="File questions with the form, and add them to quizzes from the quiz screen."
              />
            </Card>
          ) : (
            questions.map((question) => (
              <Card key={question.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="neutral">{humanise(question.type)}</Badge>
                      {question.subject ? (
                        <Badge tone="info">{question.subject.name}</Badge>
                      ) : (
                        <Badge tone="warning">Unshelved</Badge>
                      )}
                      <span className="numeric text-xs text-[var(--text-subtle)]">
                        {toNumber(question.points)?.toFixed(1)} mark
                        {toNumber(question.points) === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium">{question.prompt}</p>

                    {question.options.length ? (
                      <ul className="mt-2 space-y-0.5">
                        {question.options.map((option) => (
                          <li
                            key={option.id}
                            className={`flex items-center gap-1.5 text-xs ${
                              option.isCorrect
                                ? "font-medium text-[var(--success)]"
                                : "text-[var(--text-muted)]"
                            }`}
                          >
                            {option.isCorrect ? (
                              <CheckCircle2 className="size-3" />
                            ) : (
                              <span className="inline-block size-3" />
                            )}
                            {option.text}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {question.acceptedAnswers.length ? (
                      <p className="mt-1.5 text-xs text-[var(--text-subtle)]">
                        Accepts: {question.acceptedAnswers.join(", ")}
                      </p>
                    ) : null}
                  </div>

                  <form action={deleteBankQuestionAction}>
                    <input type="hidden" name="id" value={question.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      title="Remove from the bank. Quizzes that copied it keep their copies."
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </form>
                </div>
              </Card>
            ))
          )}

          <Pager
            basePath="/lms/bank"
            searchParams={params}
            page={page}
            perPage={PER_PAGE}
            total={total}
            label="questions"
          />
        </div>

        <div>
          <Card className="lg:sticky lg:top-20">
            <CardHeader
              title="File a question"
              description="Same shorthand as the quiz screen — mark correct options with *."
            />
            <BankQuestionForm
              subjects={subjects.map((subject) => ({
                value: subject.id,
                label: subject.name,
              }))}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
