"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, ShieldCheck, Vote } from "lucide-react";

import { Alert, Badge, Button, Card, CardBody } from "@/components/ui";
import { cn } from "@/lib/utils";

import { castBallotAction, type BallotState } from "../actions";

export type BallotPosition = {
  id: string;
  title: string;
  description: string | null;
  maxSelections: number;
  candidates: Array<{
    id: string;
    displayName: string;
    slogan: string | null;
    manifesto: string | null;
    photoUrl: string | null;
  }>;
};

export function BallotPaper({
  electionId,
  positions,
  allowAbstain,
  isSecret,
}: {
  electionId: string;
  positions: BallotPosition[];
  allowAbstain: boolean;
  isSecret: boolean;
}) {
  const [state, action] = useActionState<BallotState, FormData>(castBallotAction, {});
  const [choices, setChoices] = useState<Record<string, string[]>>({});

  function toggle(position: BallotPosition, candidateId: string) {
    setChoices((current) => {
      const existing = current[position.id] ?? [];

      if (existing.includes(candidateId)) {
        return { ...current, [position.id]: existing.filter((id) => id !== candidateId) };
      }
      // Single-seat positions replace rather than accumulate.
      if (position.maxSelections === 1) {
        return { ...current, [position.id]: [candidateId] };
      }
      if (existing.length >= position.maxSelections) return current;
      return { ...current, [position.id]: [...existing, candidateId] };
    });
  }

  if (state.ok) {
    return (
      <Card>
        <CardBody className="py-12 text-center">
          <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
            <CheckCircle2 className="size-7" />
          </span>
          <h2 className="text-lg font-semibold">Your vote has been counted</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Keep this receipt as proof that your ballot was recorded.
          </p>
          <p className="numeric mt-3 inline-block rounded-lg border border-dashed border-[var(--border-strong)] px-4 py-2 text-lg font-semibold">
            {state.receipt}
          </p>
          {isSecret ? (
            <p className="mx-auto mt-4 max-w-md text-xs text-[var(--text-subtle)]">
              This was a secret ballot. The receipt proves you voted; it cannot be used
              by anyone — including the school — to find out how you voted.
            </p>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  const answered = positions.filter(
    (position) => (choices[position.id]?.length ?? 0) > 0,
  ).length;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="electionId" value={electionId} />
      {Object.entries(choices).flatMap(([positionId, ids]) =>
        ids.map((id) => (
          <input key={`${positionId}-${id}`} type="hidden" name={`position:${positionId}`} value={id} />
        )),
      )}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {isSecret ? (
        <Alert tone="info">
          <span className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            This is a secret ballot. The system records that you voted, never how.
          </span>
        </Alert>
      ) : null}

      {positions.map((position) => {
        const selected = choices[position.id] ?? [];

        return (
          <Card key={position.id}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold">{position.title}</h2>
                {position.description ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    {position.description}
                  </p>
                ) : null}
              </div>
              <Badge tone={selected.length ? "success" : "neutral"}>
                {position.maxSelections === 1
                  ? selected.length
                    ? "Chosen"
                    : "Choose one"
                  : `${selected.length}/${position.maxSelections} chosen`}
              </Badge>
            </div>

            <CardBody className="grid gap-2 sm:grid-cols-2">
              {position.candidates.map((candidate) => {
                const isSelected = selected.includes(candidate.id);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => toggle(position, candidate.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      isSelected
                        ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                        : "border-[var(--border)] hover:bg-[var(--bg-subtle)]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                        isSelected
                          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                          : "border-[var(--border-strong)]",
                      )}
                    >
                      {isSelected ? <CheckCircle2 className="size-3.5" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {candidate.displayName}
                      </span>
                      {candidate.slogan ? (
                        <span className="block text-xs italic text-[var(--text-muted)]">
                          &ldquo;{candidate.slogan}&rdquo;
                        </span>
                      ) : null}
                      {candidate.manifesto ? (
                        <span className="mt-1 block text-xs text-[var(--text-subtle)]">
                          {candidate.manifesto}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}

              {allowAbstain ? (
                <button
                  type="button"
                  onClick={() => setChoices((current) => ({ ...current, [position.id]: [] }))}
                  className={cn(
                    "rounded-lg border border-dashed p-3 text-left text-sm transition-colors",
                    selected.length === 0
                      ? "border-[var(--border-strong)] bg-[var(--bg-subtle)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]",
                  )}
                >
                  Abstain from this position
                </button>
              ) : null}
            </CardBody>
          </Card>
        );
      })}

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-muted)]">
            {answered} of {positions.length} position
            {positions.length === 1 ? "" : "s"} selected.
            <span className="block text-xs text-[var(--text-subtle)]">
              A ballot cannot be changed once submitted.
            </span>
          </p>
          <SubmitButton disabled={!allowAbstain && answered < positions.length} />
        </CardBody>
      </Card>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending || disabled}>
      <Vote className="size-4" />
      {pending ? "Casting…" : "Cast my vote"}
    </Button>
  );
}
