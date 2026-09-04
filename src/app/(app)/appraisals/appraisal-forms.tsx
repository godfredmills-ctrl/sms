"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Plus, Send, ThumbsUp, Trash2, X } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import {
  CRITERIA,
  RATINGS,
  allowedTransitions,
  overall,
  ratingLabel,
  statusLabel,
  type Role,
  type Score,
} from "@/lib/appraisal-rules";

import {
  moveAppraisalAction,
  openAppraisalAction,
  saveAppraisalAction,
  saveSelfAssessmentAction,
  type AppraisalState,
} from "./actions";

/** Opening one, which is where somebody decides who appraises whom. */
export function OpenAppraisalForm({
  staff,
  years,
  terms,
}: {
  staff: Array<{ value: string; label: string; description?: string }>;
  years: Array<{ value: string; label: string }>;
  terms: Array<{ value: string; label: string }>;
}) {
  const [state, action] = useActionState<AppraisalState, FormData>(openAppraisalAction, {});
  const [appraisee, setAppraisee] = useState("");

  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Who is being appraised" htmlFor="ap-staff" required>
          <SearchableSelect
            id="ap-staff"
            name="staffId"
            clearable={false}
            options={staff}
            placeholder="Choose a member of staff"
            onChange={(value) => setAppraisee(String(value))}
          />
        </Field>

        <Field
          label="Who is appraising them"
          htmlFor="ap-appraiser"
          required
          hint="Not the same person. There is no reporting line in this system, so somebody has to say."
        >
          <SearchableSelect
            id="ap-appraiser"
            name="appraiserId"
            clearable={false}
            // The one name that cannot go here is the one already above it.
            options={staff.filter((person) => person.value !== appraisee)}
            placeholder="Choose an appraiser"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Year" htmlFor="ap-year" required>
          <SearchableSelect
            id="ap-year"
            name="academicYearId"
            clearable={false}
            defaultValue={years[0]?.value}
            options={years}
          />
        </Field>

        <Field
          label="Term"
          htmlFor="ap-term"
          hint="Leave blank for a whole-year appraisal, which is the usual thing."
        >
          <SearchableSelect id="ap-term" name="termId" options={terms} placeholder="The whole year" />
        </Field>
      </div>

      <Open />
    </form>
  );
}

function Open() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Plus className="size-4" />
      {pending ? "Opening…" : "Open it"}
    </Button>
  );
}

/** The appraisee's own half, written before anybody rates them. */
export function SelfAssessmentForm({
  id,
  value,
  editable,
}: {
  id: string;
  value: string;
  editable: boolean;
}) {
  const [state, action] = useActionState<AppraisalState, FormData>(
    saveSelfAssessmentAction,
    {},
  );

  if (!editable) {
    return value ? (
      <p className="text-sm leading-relaxed whitespace-pre-line">{value}</p>
    ) : (
      <p className="text-sm text-[var(--text-muted)]">Nothing was written.</p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <Field
        label="Your own account of the year"
        htmlFor="self"
        hint="What went well, what did not, and what you want help with. You write this before anybody rates you, which is deliberate."
      >
        <Textarea id="self" name="selfAssessment" rows={8} defaultValue={value} />
      </Field>

      <SaveSelf />
    </form>
  );
}

function SaveSelf() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      <Check className="size-4" />
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

type TargetDraft = { description: string; reviewBy: string };

/**
 * The appraiser's half.
 *
 * The running count of what is still unrated sits at the top, because the
 * heading somebody has not filled in is reliably the one they were avoiding,
 * and the form will not let it be sent until it is done.
 */
export function AppraisalForm({
  id,
  scores,
  comment,
  targets,
  editable,
}: {
  id: string;
  scores: Array<Score & { note: string | null }>;
  comment: string;
  targets: TargetDraft[];
  editable: boolean;
}) {
  const [state, action] = useActionState<AppraisalState, FormData>(saveAppraisalAction, {});
  const [ratings, setRatings] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      scores.map((score) => [score.criterion, score.rating ? String(score.rating) : ""]),
    ),
  );
  const [rows, setRows] = useState<TargetDraft[]>(
    targets.length ? targets : [{ description: "", reviewBy: "" }],
  );

  const summary = overall(
    CRITERIA.map((criterion) => ({
      criterion: criterion.key,
      rating: ratings[criterion.key] ? Number(ratings[criterion.key]) : null,
    })),
  );

  if (!editable) {
    return (
      <div className="space-y-4">
        {CRITERIA.map((criterion) => {
          const score = scores.find((row) => row.criterion === criterion.key);
          return (
            <div key={criterion.key} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{criterion.label}</p>
                {score?.note ? (
                  <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                    {score.note}
                  </p>
                ) : null}
              </div>
              <Badge tone={(score?.rating ? ratingToneOf(score.rating) : "neutral") as never}>
                {ratingLabel(score?.rating ?? null)}
              </Badge>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--bg-subtle)] p-3 text-sm">
        <span>
          {summary.rated} of {summary.of} rated
        </span>
        {summary.complete ? (
          <Badge tone="success">
            {summary.average} · {summary.band}
          </Badge>
        ) : (
          <span className="text-[var(--text-muted)]">
            There is no overall until every heading has one. A partial average
            looks exactly like a whole one.
          </span>
        )}
      </div>

      <div className="space-y-3">
        {CRITERIA.map((criterion) => (
          <div key={criterion.key} className="rounded-xl border border-[var(--border)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{criterion.label}</p>
                <p className="text-xs text-[var(--text-subtle)]">{criterion.hint}</p>
              </div>

              <Select
                name={`rating:${criterion.key}`}
                aria-label={criterion.label}
                className="w-44"
                value={ratings[criterion.key] ?? ""}
                onChange={(event) =>
                  setRatings((current) => ({
                    ...current,
                    [criterion.key]: event.target.value,
                  }))
                }
              >
                <option value="">Not rated</option>
                {RATINGS.map((rating) => (
                  <option key={rating.value} value={rating.value}>
                    {rating.value} · {rating.label}
                  </option>
                ))}
              </Select>
            </div>

            <Textarea
              name={`note:${criterion.key}`}
              rows={2}
              className="mt-2"
              placeholder="What you saw, and where."
              defaultValue={scores.find((row) => row.criterion === criterion.key)?.note ?? ""}
            />
          </div>
        ))}
      </div>

      <Field
        label="The appraisal"
        htmlFor="appraiser-comment"
        required
        hint="Ratings with nothing said about them are not something anybody can act on."
      >
        <Textarea
          id="appraiser-comment"
          name="appraiserComment"
          rows={6}
          defaultValue={comment}
        />
      </Field>

      <div className="space-y-2">
        <p className="text-sm font-medium">Targets</p>
        <p className="text-xs text-[var(--text-subtle)]">
          At least one. An appraisal that asks for nothing to change is a form
          rather than a conversation.
        </p>

        {rows.map((row, index) => (
          <div key={index} className="flex items-end gap-2">
            <Field label={index === 0 ? "What is to be different" : undefined} className="flex-1">
              <Input
                name="targetDescription"
                value={row.description}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((entry, at) =>
                      at === index ? { ...entry, description: event.target.value } : entry,
                    ),
                  )
                }
                placeholder="Hand in lesson notes by the Friday before the week."
              />
            </Field>

            <Field label={index === 0 ? "Review by" : undefined}>
              <Input
                name="targetReviewBy"
                type="date"
                value={row.reviewBy}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((entry, at) =>
                      at === index ? { ...entry, reviewBy: event.target.value } : entry,
                    ),
                  )
                }
              />
            </Field>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove this target"
              onClick={() =>
                setRows((current) =>
                  current.length === 1
                    ? [{ description: "", reviewBy: "" }]
                    : current.filter((_, at) => at !== index),
                )
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="secondary"
          onClick={() => setRows((current) => [...current, { description: "", reviewBy: "" }])}
        >
          <Plus className="size-4" />
          Another target
        </Button>
      </div>

      <SaveAppraisal />
    </form>
  );
}

function ratingToneOf(value: number): string {
  return RATINGS.find((rating) => rating.value === value)?.tone ?? "neutral";
}

function SaveAppraisal() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      <Check className="size-4" />
      {pending ? "Saving…" : "Save without sending"}
    </Button>
  );
}

/**
 * The buttons that move it along.
 *
 * Drawn from the same table the action refuses from, so the appraiser is never
 * offered a button that signs on somebody else's behalf: that transition
 * belongs to the appraisee and the table says so.
 */
export function MoveForm({
  id,
  status,
  roles,
}: {
  id: string;
  status: string;
  roles: Role[];
}) {
  const [state, action] = useActionState<AppraisalState, FormData>(moveAppraisalAction, {});
  const [to, setTo] = useState<string | null>(null);

  const options = allowedTransitions(status, roles);

  if (options.length === 0) {
    return (
      <>
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}
        <p className="text-sm text-[var(--text-muted)]">
          Nothing for you to do here at the moment.
        </p>
      </>
    );
  }

  return (
    <div className="space-y-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.to}
            type="button"
            variant={
              option.to === "AGREED"
                ? "primary"
                : option.to === "DISPUTED"
                  ? "danger"
                  : "secondary"
            }
            onClick={() => setTo(option.to)}
          >
            {option.to === "SELF_ASSESSED" ? <Send className="size-4" /> : null}
            {option.to === "AGREED" ? <ThumbsUp className="size-4" /> : null}
            {option.label}
          </Button>
        ))}
      </div>

      {to ? (
        <form action={action} className="space-y-3 rounded-xl bg-[var(--bg-subtle)] p-3">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="to" value={to} />

          <p className="text-sm">
            It becomes <strong>{statusLabel(to).toLowerCase()}</strong>.
          </p>

          {to === "AGREED" || to === "DISPUTED" ? (
            <Field
              label={to === "DISPUTED" ? "What you disagree with" : "Anything you want to add"}
              htmlFor={`response-${to}`}
              required={to === "DISPUTED"}
              hint={
                to === "DISPUTED"
                  ? "Your words go on the record beside the appraisal, which is the point of being able to disagree at all."
                  : "Optional, and kept with the appraisal."
              }
            >
              <Textarea id={`response-${to}`} name="note" rows={3} />
            </Field>
          ) : null}

          <div className="flex gap-2">
            <Confirm label={options.find((option) => option.to === to)?.label ?? "Do it"} />
            <Button type="button" variant="ghost" onClick={() => setTo(null)}>
              <X className="size-4" />
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Confirm({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Check className="size-4" />
      {pending ? "Saving…" : label}
    </Button>
  );
}
