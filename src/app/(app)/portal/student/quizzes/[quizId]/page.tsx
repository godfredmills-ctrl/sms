import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Hourglass, XCircle } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  ProgressBar,
  StatCard,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canRevealAnswers, seededShuffle } from "@/lib/quizzes";
import { formatDateTime, humanise, relativeTime, toNumber } from "@/lib/utils";

import { NotLinked } from "../../not-linked";
import { QuizPaper, type PaperQuestion } from "./quiz-paper";
import { StartForm } from "./start-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ quizId: string }>;
}): Promise<Metadata> {
  const { quizId } = await params;
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { title: true },
  });
  return { title: quiz?.title ?? "Quiz" };
}

export const dynamic = "force-dynamic";

export default async function StudentQuizPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const user = await requireUser();
  if (!user.studentId) return <NotLinked title="Quiz" />;

  const { quizId } = await params;

  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          offering: { select: { classSectionId: true } },
        },
      },
      questions: {
        orderBy: { sortKey: "asc" },
        include: { options: { orderBy: { sortKey: "asc" } } },
      },
    },
  });

  if (!quiz || !quiz.isPublished) notFound();

  // The quiz belongs to a class; a student in another class has no business
  // seeing the paper, whatever link they followed.
  const enrolled = quiz.course.offering
    ? await db.enrollment.findFirst({
        where: {
          studentId: user.studentId,
          classSectionId: quiz.course.offering.classSectionId,
          status: "ACTIVE",
        },
        select: { id: true },
      })
    : { id: "standalone" };

  if (!enrolled) notFound();

  const attempts = await db.quizAttempt.findMany({
    where: { quizId, studentId: user.studentId },
    orderBy: { attempt: "desc" },
    include: {
      answers: {
        include: {
          question: {
            select: {
              id: true,
              prompt: true,
              points: true,
              explanation: true,
              options: { select: { id: true, text: true, isCorrect: true } },
            },
          },
        },
      },
    },
  });

  const inProgress = attempts.find((attempt) => attempt.status === "IN_PROGRESS");
  const latestDone = attempts.find((attempt) => attempt.status !== "IN_PROGRESS");
  const attemptsLeft = quiz.maxAttempts - attempts.length;

  const now = new Date();
  const notOpen = quiz.opensAt && now < quiz.opensAt;
  const closed = quiz.closesAt && now > quiz.closesAt;

  const totalMarks = quiz.questions.reduce(
    (sum, question) => sum + (toNumber(question.points) ?? 1),
    0,
  );

  return (
    <>
      <PageHeader
        title={quiz.title}
        description={quiz.description ?? quiz.course.title}
        breadcrumb={
          <Link href="/portal/student/courses" className="hover:text-[var(--text)]">
            My courses
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Questions" value={quiz.questions.length} tone="violet" />
        <StatCard label="Total marks" value={totalMarks} tone="info" />
        <StatCard
          label="Time limit"
          value={quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} min` : "None"}
          tone="teal"
          icon={<Clock className="size-4" />}
        />
        <StatCard
          label="Pass mark"
          value={`${quiz.passMark}%`}
          hint={`${Math.max(0, attemptsLeft)} of ${quiz.maxAttempts} attempts left`}
          tone="neutral"
        />
      </div>

      {notOpen ? (
        <Alert tone="info" className="mb-4">
          This quiz opens {formatDateTime(quiz.opensAt)}.
        </Alert>
      ) : null}
      {closed && !inProgress ? (
        <Alert tone="warning" className="mb-4">
          This quiz closed {relativeTime(quiz.closesAt)}.
        </Alert>
      ) : null}

      {/* Taking */}
      {inProgress ? (
        <QuizPaper
          attemptId={inProgress.id}
          startedAt={inProgress.startedAt.toISOString()}
          timeLimitMinutes={quiz.timeLimitMinutes}
          questions={(quiz.shuffleQuestions
            ? // Seeded on the attempt, so the order is stable across a reload
              // but different between students.
              seededShuffle(quiz.questions, inProgress.id)
            : quiz.questions
          ).map<PaperQuestion>((question) => ({
            id: question.id,
            type: question.type,
            prompt: question.prompt,
            points: toNumber(question.points) ?? 1,
            options: (quiz.shuffleOptions
              ? seededShuffle(question.options, `${inProgress.id}:${question.id}`)
              : question.options
            ).map((option) => ({ id: option.id, text: option.text })),
          }))}
        />
      ) : null}

      {/* Starting */}
      {!inProgress && !notOpen && !closed && attemptsLeft > 0 ? (
        <Card className="mb-4">
          <CardHeader
            title={attempts.length ? "Try again" : "Ready to begin"}
            description={`${quiz.questions.length} questions · ${totalMarks} marks`}
          />
          <CardBody>
            <StartForm
              quizId={quiz.id}
              timeLimitMinutes={quiz.timeLimitMinutes}
              attemptsLeft={attemptsLeft}
            />
          </CardBody>
        </Card>
      ) : null}

      {!inProgress && attemptsLeft <= 0 ? (
        <Alert tone="info" className="mb-4">
          You have used all {quiz.maxAttempts} attempts.
        </Alert>
      ) : null}

      {/* Results */}
      {latestDone ? (
        <Card>
          <CardHeader
            title={`Attempt ${latestDone.attempt}`}
            description={`Submitted ${formatDateTime(latestDone.submittedAt)}`}
            action={
              latestDone.status === "GRADED" ? (
                <Badge tone={latestDone.passed ? "success" : "danger"}>
                  {latestDone.passed ? "Passed" : "Not passed"}
                </Badge>
              ) : (
                <Badge tone="warning">
                  <Hourglass className="size-2.5" />
                  Awaiting marking
                </Badge>
              )
            }
          />
          <CardBody className="space-y-4">
            {latestDone.status === "GRADED" ? (
              <div>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Your score</span>
                  <span className="numeric font-semibold">
                    {toNumber(latestDone.score)} / {toNumber(latestDone.maxScore)}
                    <span className="ml-1.5 text-xs text-[var(--text-subtle)]">
                      {toNumber(latestDone.percent)?.toFixed(1)}%
                    </span>
                  </span>
                </div>
                <ProgressBar
                  value={toNumber(latestDone.percent) ?? 0}
                  tone={latestDone.passed ? "success" : "danger"}
                  label={`Score ${toNumber(latestDone.percent)?.toFixed(0)}%`}
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Some questions on this paper need your teacher to read them, so no
                score is shown yet. A part-marked score would look like a result you
                had not actually been given.
              </p>
            )}

            {canRevealAnswers(quiz, true) ? (
              <ul className="space-y-2">
                {latestDone.answers.map((answer) => {
                  const chosen = answer.question.options.filter(
                    (option) =>
                      option.id === answer.optionId ||
                      answer.optionIds.includes(option.id),
                  );
                  const correct = answer.question.options.filter(
                    (option) => option.isCorrect,
                  );

                  return (
                    <li
                      key={answer.id}
                      className="rounded-lg border border-[var(--border)] p-3"
                    >
                      <div className="flex items-start gap-2.5">
                        {answer.isCorrect === null ? (
                          <Hourglass className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />
                        ) : answer.isCorrect ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
                        ) : (
                          <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {answer.question.prompt}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            You answered:{" "}
                            {chosen.length
                              ? chosen.map((option) => option.text).join(", ")
                              : (answer.textAnswer ?? "nothing")}
                          </p>
                          {answer.isCorrect === false && correct.length ? (
                            <p className="text-xs text-[var(--success)]">
                              Correct: {correct.map((option) => option.text).join(", ")}
                            </p>
                          ) : null}
                          {answer.question.explanation ? (
                            <p className="mt-1 text-xs text-[var(--text-subtle)]">
                              {answer.question.explanation}
                            </p>
                          ) : null}
                          {answer.feedback ? (
                            <p className="mt-1 rounded bg-[var(--bg-subtle)] p-2 text-xs">
                              {answer.feedback}
                            </p>
                          ) : null}
                        </div>
                        <span className="numeric shrink-0 text-xs">
                          {answer.pointsAwarded === null
                            ? "—"
                            : `${toNumber(answer.pointsAwarded)}/${toNumber(answer.question.points)}`}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-[var(--text-subtle)]">
                {quiz.showAnswersAfter === "NEVER"
                  ? "Answers are not shown for this quiz."
                  : `Answers are shown after the quiz closes${quiz.closesAt ? ` on ${formatDateTime(quiz.closesAt)}` : ""} — so that everyone sits the same paper.`}
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {attempts.length > 1 ? (
        <Card className="mt-4">
          <CardHeader title="Previous attempts" />
          <ul className="divide-y divide-[var(--border)]">
            {attempts.slice(1).map((attempt) => (
              <li
                key={attempt.id}
                className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
              >
                <span>
                  Attempt {attempt.attempt}
                  <span className="ml-2 text-xs text-[var(--text-subtle)]">
                    {humanise(attempt.status)} · {relativeTime(attempt.submittedAt)}
                  </span>
                </span>
                <span className="numeric">
                  {attempt.percent === null
                    ? "—"
                    : `${toNumber(attempt.percent)?.toFixed(0)}%`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
