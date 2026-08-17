import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Hourglass,
  Plus,
  Trash2,
  Users,
} from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  ProgressBar,
  StatCard,
  Textarea,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { percentOf } from "@/lib/money";
import { formatDateTime, fullName, humanise, toNumber } from "@/lib/utils";

import { addFromBankAction } from "../../bank/actions";
import {
  addQuestionAction,
  deleteQuestionAction,
  markAnswerAction,
  toggleQuizPublishedAction,
} from "../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const quiz = await db.quiz.findUnique({ where: { id }, select: { title: true } });
  return { title: quiz?.title ?? "Quiz" };
}

export const dynamic = "force-dynamic";

const QUESTION_TYPES = [
  { value: "MULTIPLE_CHOICE", label: "Multiple choice (one answer)" },
  { value: "MULTIPLE_ANSWER", label: "Multiple choice (several answers)" },
  { value: "TRUE_FALSE", label: "True or false" },
  { value: "SHORT_ANSWER", label: "Short answer" },
  { value: "FILL_BLANK", label: "Fill in the blank" },
  { value: "ESSAY", label: "Essay (marked by you)" },
];

export default async function QuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission(["lms.course.read", "lms.quiz.manage"]);
  // Staff surface only. Students hold lms.course.read for their portal, and
  // this page carries the answer key, the class results and the marking
  // queue — none of which survive a student opening the URL by hand.
  if (user.portal !== "STAFF") notFound();
  const { id } = await params;
  const canManage = userCan(user, "lms.quiz.manage");

  const quiz = await db.quiz.findUnique({
    where: { id },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          offering: {
            select: {
              subjectId: true,
              classSection: {
                select: { _count: { select: { enrollments: true } } },
              },
            },
          },
        },
      },
      questions: {
        orderBy: { sortKey: "asc" },
        include: { options: { orderBy: { sortKey: "asc" } } },
      },
      attempts: {
        orderBy: { submittedAt: "desc" },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, otherNames: true },
          },
          answers: {
            where: { pointsAwarded: null },
            include: {
              question: { select: { prompt: true, points: true, type: true } },
            },
          },
        },
      },
    },
  });

  if (!quiz) notFound();

  // The bank shelf for this quiz's subject, plus unshelved questions. Only
  // fetched for someone who can author.
  const bankQuestions = canManage
    ? await db.quizQuestion.findMany({
        where: {
          quizId: null,
          OR: [
            { subjectId: quiz.course.offering?.subjectId ?? "___none___" },
            { subjectId: null },
          ],
        },
        orderBy: { id: "desc" },
        take: 50,
        select: { id: true, prompt: true },
      })
    : [];

  const totalMarks = quiz.questions.reduce(
    (sum, question) => sum + (toNumber(question.points) ?? 1),
    0,
  );
  const classSize = quiz.course.offering?.classSection._count.enrollments ?? 0;

  const submitted = quiz.attempts.filter((attempt) => attempt.status !== "IN_PROGRESS");
  const graded = submitted.filter((attempt) => attempt.status === "GRADED");
  const awaiting = submitted.filter((attempt) => attempt.answers.length > 0);

  const averagePercent = graded.length
    ? graded.reduce((sum, attempt) => sum + (toNumber(attempt.percent) ?? 0), 0) /
      graded.length
    : null;
  const passRate = graded.length
    ? percentOf(graded.filter((attempt) => attempt.passed).length, graded.length)
    : 0;

  return (
    <>
      <PageHeader
        title={quiz.title}
        description={quiz.description ?? quiz.course.title}
        breadcrumb={
          <Link href={`/lms/${quiz.course.id}`} className="hover:text-[var(--text)]">
            {quiz.course.title}
          </Link>
        }
        action={
          <>
            <Badge tone={quiz.isPublished ? "success" : "warning"}>
              {quiz.isPublished ? "Published" : "Draft"}
            </Badge>
            {canManage ? (
              <form action={toggleQuizPublishedAction}>
                <input type="hidden" name="id" value={quiz.id} />
                <Button type="submit" disabled={!quiz.isPublished && !quiz.questions.length}>
                  {quiz.isPublished ? (
                    <>
                      <EyeOff className="size-4" />
                      Unpublish
                    </>
                  ) : (
                    <>
                      <Eye className="size-4" />
                      Publish
                    </>
                  )}
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Questions"
          value={quiz.questions.length}
          hint={`${totalMarks} marks`}
          tone="violet"
        />
        <StatCard
          label="Sat"
          value={`${submitted.length}${classSize ? `/${classSize}` : ""}`}
          tone="info"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Class average"
          value={averagePercent === null ? "—" : `${averagePercent.toFixed(1)}%`}
          hint={`${passRate.toFixed(0)}% passed`}
          tone={averagePercent !== null && averagePercent >= quiz.passMark ? "success" : "warning"}
        />
        <StatCard
          label="Awaiting marking"
          value={awaiting.length}
          tone={awaiting.length ? "warning" : "success"}
          icon={<Hourglass className="size-4" />}
        />
      </div>

      {quiz.questions.length === 0 ? (
        <Alert tone="warning" className="mb-4">
          This quiz has no questions, so it cannot be published — a student would get
          a blank paper and a score of 0 out of 0.
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* Marking queue ------------------------------------------------ */}
          {awaiting.length ? (
            <Card>
              <CardHeader
                title="Waiting for you"
                description="Essays and anything without a recorded answer are left for a human."
              />
              <ul className="divide-y divide-[var(--border)]">
                {awaiting.map((attempt) => (
                  <li key={attempt.id} className="px-5 py-3">
                    <p className="mb-2 text-sm font-medium">
                      {fullName(attempt.student)}
                      <span className="ml-2 text-xs text-[var(--text-subtle)]">
                        attempt {attempt.attempt} ·{" "}
                        {formatDateTime(attempt.submittedAt)}
                      </span>
                    </p>

                    <ul className="space-y-2">
                      {attempt.answers.map((answer) => (
                        <li key={answer.id}>
                          <form
                            action={markAnswerAction}
                            className="rounded-lg border border-[var(--border)] p-3"
                          >
                            <input type="hidden" name="answerId" value={answer.id} />
                            <input type="hidden" name="quizId" value={quiz.id} />

                            <p className="text-xs text-[var(--text-muted)]">
                              {answer.question.prompt}
                            </p>
                            <p className="mt-1 rounded bg-[var(--bg-subtle)] p-2 text-sm whitespace-pre-wrap">
                              {answer.textAnswer || "(no answer given)"}
                            </p>

                            <div className="mt-2 flex flex-wrap items-end gap-2">
                              <Field label="Marks" htmlFor={`p-${answer.id}`} className="w-24">
                                <Input
                                  id={`p-${answer.id}`}
                                  name="points"
                                  type="number"
                                  min="0"
                                  max={toNumber(answer.question.points) ?? 1}
                                  step="0.5"
                                  required
                                  placeholder={`/${toNumber(answer.question.points)}`}
                                  className="text-right"
                                />
                              </Field>
                              <Field
                                label="Feedback"
                                htmlFor={`f-${answer.id}`}
                                className="min-w-[160px] flex-1"
                              >
                                <Input id={`f-${answer.id}`} name="feedback" />
                              </Field>
                              <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                className="mb-0.5"
                              >
                                Mark
                              </Button>
                            </div>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* Questions ---------------------------------------------------- */}
          <Card>
            <CardHeader
              title="Questions"
              description={`${quiz.questions.length} · ${totalMarks} marks`}
            />
            {quiz.questions.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {quiz.questions.map((question, index) => (
                  <li key={question.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          <span className="mr-2 text-[var(--text-subtle)]">
                            {index + 1}.
                          </span>
                          {question.prompt}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                          {humanise(question.type)} ·{" "}
                          {toNumber(question.points)}{" "}
                          {toNumber(question.points) === 1 ? "mark" : "marks"}
                        </p>

                        {question.options.length ? (
                          <ul className="mt-1.5 space-y-0.5">
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
                                  <span className="size-3" />
                                )}
                                {option.text}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {question.acceptedAnswers.length ? (
                          <p className="mt-1 text-xs text-[var(--success)]">
                            Accepts: {question.acceptedAnswers.join(", ")}
                          </p>
                        ) : null}
                      </div>

                      {canManage ? (
                        <form action={deleteQuestionAction}>
                          <input type="hidden" name="id" value={question.id} />
                          <input type="hidden" name="quizId" value={quiz.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No questions yet" />
            )}
          </Card>

          {/* Results ------------------------------------------------------ */}
          {graded.length ? (
            <Card>
              <CardHeader title="Results" description={`${graded.length} marked`} />
              <ul className="divide-y divide-[var(--border)]">
                {graded.map((attempt) => {
                  const percent = toNumber(attempt.percent) ?? 0;
                  const minutes = Math.round(attempt.timeSpentSeconds / 60);
                  // An over-run is shown, not punished — the decision is the
                  // teacher's, and a slow connection is not cheating.
                  const overtime =
                    quiz.timeLimitMinutes !== null &&
                    attempt.timeSpentSeconds > quiz.timeLimitMinutes * 60 + 30;

                  return (
                    <li key={attempt.id} className="px-5 py-2.5">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="text-sm">
                          {fullName(attempt.student)}
                          <span className="ml-2 text-xs text-[var(--text-subtle)]">
                            {minutes} min
                          </span>
                          {overtime ? (
                            <Badge tone="warning" className="ml-1.5">
                              Over time
                            </Badge>
                          ) : null}
                        </span>
                        <span className="numeric text-sm">
                          {toNumber(attempt.score)}/{toNumber(attempt.maxScore)}
                          <span className="ml-1.5 text-xs text-[var(--text-subtle)]">
                            {percent.toFixed(0)}%
                          </span>
                        </span>
                      </div>
                      <ProgressBar
                        value={percent}
                        tone={attempt.passed ? "success" : "danger"}
                        label={`${fullName(attempt.student)} ${percent.toFixed(0)}%`}
                      />
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </div>

        {/* Authoring ------------------------------------------------------ */}
        {canManage ? (
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Add a question"
                description="Mark correct options with a leading asterisk."
              />
              <form action={addQuestionAction}>
                <CardBody className="space-y-3">
                  <input type="hidden" name="quizId" value={quiz.id} />

                  <Field label="Question" htmlFor="prompt" required>
                    <Textarea id="prompt" name="prompt" rows={2} required />
                  </Field>

                  <Field label="Type" htmlFor="type">
                    <SearchableSelect
                      id="type"
                      name="type"
                      clearable={false}
                      defaultValue="MULTIPLE_CHOICE"
                      options={QUESTION_TYPES}
                    />
                  </Field>

                  <Field
                    label="Options"
                    htmlFor="options"
                    hint="One per line. Prefix the correct one(s) with *"
                  >
                    <Textarea
                      id="options"
                      name="options"
                      rows={4}
                      placeholder={"*Accra\nKumasi\nTakoradi\nTamale"}
                    />
                  </Field>

                  <Field
                    label="True/false answer"
                    htmlFor="correctBoolean"
                    hint="Only used for a true-or-false question."
                  >
                    <SearchableSelect
                      id="correctBoolean"
                      name="correctBoolean"
                      clearable={false}
                      defaultValue="true"
                      options={[
                        { value: "true", label: "True is correct" },
                        { value: "false", label: "False is correct" },
                      ]}
                    />
                  </Field>

                  <Field
                    label="Accepted answers"
                    htmlFor="acceptedAnswers"
                    hint="Short answer only. Comma separated; case and punctuation are ignored. Leave blank to mark it yourself."
                  >
                    <Input id="acceptedAnswers" name="acceptedAnswers" />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Marks" htmlFor="points">
                      <Input
                        id="points"
                        name="points"
                        type="number"
                        min="0.5"
                        step="0.5"
                        defaultValue={1}
                      />
                    </Field>
                  </div>

                  <Field
                    label="Explanation"
                    htmlFor="explanation"
                    hint="Shown with the answers, if you reveal them."
                  >
                    <Textarea id="explanation" name="explanation" rows={2} />
                  </Field>

                  <Button type="submit" variant="outline" size="sm" className="w-full">
                    <Plus className="size-3.5" />
                    Add question
                  </Button>
                </CardBody>
              </form>
            </Card>

            {/* The bank shelf for this quiz's subject: one click copies a
                question in. Copies, deliberately — editing this quiz must
                never rewrite the bank or another teacher's quiz. */}
            {bankQuestions.length ? (
              <Card>
                <CardHeader
                  title="From the question bank"
                  description={`${bankQuestions.length} on the shelf. Adding copies the question into this quiz.`}
                  action={
                    <Link
                      href="/lms/bank"
                      className="text-xs text-[var(--primary)] hover:underline"
                    >
                      Open the bank
                    </Link>
                  }
                />
                <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto">
                  {bankQuestions.map((question) => (
                    <li
                      key={question.id}
                      className="flex items-center gap-2 px-4 py-2.5"
                    >
                      <p className="min-w-0 flex-1 truncate text-xs">{question.prompt}</p>
                      <form action={addFromBankAction}>
                        <input type="hidden" name="quizId" value={quiz.id} />
                        <input type="hidden" name="bankQuestionId" value={question.id} />
                        <Button type="submit" variant="ghost" size="sm" title="Copy into this quiz">
                          <Plus className="size-3.5" />
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card>
              <CardBody className="space-y-1.5 text-xs text-[var(--text-muted)]">
                <p className="font-medium text-[var(--text)]">How this quiz behaves</p>
                <p>Pass mark {quiz.passMark}%.</p>
                <p>
                  {quiz.maxAttempts} attempt{quiz.maxAttempts === 1 ? "" : "s"} each.
                </p>
                <p>
                  {quiz.timeLimitMinutes
                    ? `${quiz.timeLimitMinutes} minute limit, timed on the server.`
                    : "No time limit."}
                </p>
                <p>
                  Questions {quiz.shuffleQuestions ? "shuffled" : "in order"}, options{" "}
                  {quiz.shuffleOptions ? "shuffled" : "in order"}.
                </p>
                <p>
                  Answers revealed:{" "}
                  {quiz.showAnswersAfter === "IMMEDIATELY"
                    ? "as soon as a student submits"
                    : quiz.showAnswersAfter === "NEVER"
                      ? "never"
                      : "once the quiz closes"}
                  .
                </p>
              </CardBody>
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
