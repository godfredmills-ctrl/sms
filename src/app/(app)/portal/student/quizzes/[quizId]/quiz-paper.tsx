"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Clock, Send, TriangleAlert } from "lucide-react";

import { Alert, Badge, Button, Card, CardBody, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

import { submitAttemptAction, type AttemptState } from "../../../../lms/quizzes/actions";

export type PaperQuestion = {
  id: string;
  type: string;
  prompt: string;
  points: number;
  options: Array<{ id: string; text: string }>;
};

export function QuizPaper({
  attemptId,
  questions,
  timeLimitMinutes,
  startedAt,
}: {
  attemptId: string;
  questions: PaperQuestion[];
  timeLimitMinutes: number | null;
  startedAt: string;
}) {
  const [state, action] = useActionState<AttemptState, FormData>(
    submitAttemptAction,
    {},
  );
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (timeLimitMinutes === null) return;

    // Counted from the server's start time rather than from mount, so
    // reloading the page does not hand the student a fresh clock.
    const deadline = new Date(startedAt).getTime() + timeLimitMinutes * 60_000;

    function tick() {
      setSecondsLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    }

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [timeLimitMinutes, startedAt]);

  useEffect(() => {
    if (secondsLeft !== 0) return;
    // Fire once. The interval keeps ticking at zero, and a second submission
    // would hit the server's "already submitted" guard and replace the
    // student's confirmation with an error they cannot act on.
    if (autoSubmitted.current) return;
    autoSubmitted.current = true;

    // requestSubmit(), not a dispatched Event: a synthetic submit event does
    // not reliably drive a React form action, and requestSubmit is the API
    // that does — it also runs the same validation a real click would.
    formRef.current?.requestSubmit();
  }, [secondsLeft]);

  // The action revalidates on the server, but this is a client component
  // rendering its own success state — without a refresh the student sits on
  // "submitted" and has to reload by hand to see the mark.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (state.ok) {
    return (
      <Card>
        <CardBody className="py-12 text-center">
          <h2 className="text-lg font-semibold">Your answers have been submitted</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Fetching your result…
          </p>
        </CardBody>
      </Card>
    );
  }

  const done = Object.values(answered).filter(Boolean).length;
  const urgent = secondsLeft !== null && secondsLeft <= 60;

  return (
    <form ref={formRef} id="quiz-paper" action={action} className="space-y-4">
      <input type="hidden" name="attemptId" value={attemptId} />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)]/95 px-4 py-2.5 backdrop-blur">
        <span className="text-sm">
          {done} of {questions.length} answered
        </span>
        {secondsLeft !== null ? (
          <Badge tone={urgent ? "danger" : secondsLeft <= 300 ? "warning" : "neutral"}>
            <Clock className="size-2.5" />
            {Math.floor(secondsLeft / 60)}:
            {String(secondsLeft % 60).padStart(2, "0")} left
          </Badge>
        ) : null}
      </div>

      {urgent ? (
        <Alert tone="danger">
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Less than a minute left. The paper submits itself when the time runs out —
            nothing you have written will be lost.
          </span>
        </Alert>
      ) : null}

      {questions.map((question, index) => (
        <Card key={question.id}>
          <CardBody>
            <input type="hidden" name="questionId" value={question.id} />

            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-sm font-medium">
                <span className="mr-2 text-[var(--text-subtle)]">{index + 1}.</span>
                {question.prompt}
              </p>
              <Badge tone="neutral">
                {question.points} {question.points === 1 ? "mark" : "marks"}
              </Badge>
            </div>

            {question.type === "SHORT_ANSWER" ||
            question.type === "FILL_BLANK" ||
            question.type === "ESSAY" ? (
              <Textarea
                name={`text:${question.id}`}
                rows={question.type === "ESSAY" ? 6 : 2}
                placeholder="Your answer"
                aria-label={`Answer to question ${index + 1}`}
                onChange={(event) =>
                  setAnswered((current) => ({
                    ...current,
                    [question.id]: event.target.value.trim().length > 0,
                  }))
                }
              />
            ) : (
              <ul className="space-y-1.5">
                {question.options.map((option) => (
                  <li key={option.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm transition-colors",
                        "border-[var(--border)] hover:bg-[var(--bg-subtle)]",
                        "has-checked:border-[var(--primary)] has-checked:bg-[var(--primary-soft)]",
                      )}
                    >
                      <input
                        type={
                          question.type === "MULTIPLE_ANSWER" ? "checkbox" : "radio"
                        }
                        name={`answer:${question.id}`}
                        value={option.id}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                        onChange={() =>
                          setAnswered((current) => ({
                            ...current,
                            [question.id]: true,
                          }))
                        }
                      />
                      <span>{option.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {question.type === "MULTIPLE_ANSWER" ? (
              <p className="mt-2 text-xs text-[var(--text-subtle)]">
                Select every correct option — partial answers score nothing.
              </p>
            ) : null}
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-muted)]">
            {done === questions.length
              ? "Every question has an answer."
              : `${questions.length - done} unanswered.`}
            <span className="block text-xs text-[var(--text-subtle)]">
              You cannot change your answers once submitted.
            </span>
          </p>
          <SubmitButton />
        </CardBody>
      </Card>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      <Send className="size-4" />
      {pending ? "Submitting…" : "Submit answers"}
    </Button>
  );
}
