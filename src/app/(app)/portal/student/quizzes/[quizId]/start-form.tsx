"use client";

import { useState, useTransition } from "react";
import { PlayCircle } from "lucide-react";

import { Alert, Button } from "@/components/ui";

import { startAttemptAction } from "../../../../lms/quizzes/actions";

/**
 * Starting an attempt is a deliberate act with a visible warning, because the
 * clock begins the moment it is pressed and an attempt cannot be handed back.
 */
export function StartForm({
  quizId,
  timeLimitMinutes,
  attemptsLeft,
}: {
  quizId: string;
  timeLimitMinutes: number | null;
  attemptsLeft: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Alert tone="warning">
        {timeLimitMinutes
          ? `You have ${timeLimitMinutes} minutes once you begin, timed from the moment you press start — closing the page does not pause it.`
          : "There is no time limit, but you cannot change your answers once submitted."}
        {attemptsLeft > 1 ? ` You have ${attemptsLeft} attempts left.` : " This is your last attempt."}
      </Alert>

      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const formData = new FormData();
            formData.set("quizId", quizId);
            const result = await startAttemptAction(formData);
            if (result.error) setError(result.error);
            else window.location.reload();
          })
        }
      >
        <PlayCircle className="size-4" />
        {pending ? "Starting…" : "Start the quiz"}
      </Button>
    </div>
  );
}
