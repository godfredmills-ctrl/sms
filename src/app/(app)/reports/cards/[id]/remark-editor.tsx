"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Save, Sparkles, Wand2 } from "lucide-react";

import { Alert, Button, Field, Input, Textarea } from "@/components/ui";

import { draftRemarkAction, saveReportCardAction, type RemarkState } from "../actions";

/**
 * Remark editor.
 *
 * The AI draft is offered as text to paste in, never written straight into the
 * teacher's field — a remark goes home under a teacher's name, so a person has
 * to have chosen the words.
 */
export function RemarkEditor({
  reportCardId,
  studentName,
  formTeacherRemark,
  headTeacherRemark,
  aiRemark,
  conduct,
  attitude,
  interest,
  activities,
  nextTermBegins,
  canEditHeadRemark,
  aiEnabled,
}: {
  reportCardId: string;
  studentName: string;
  formTeacherRemark: string | null;
  headTeacherRemark: string | null;
  aiRemark: string | null;
  conduct: string | null;
  attitude: string | null;
  interest: string | null;
  activities: string | null;
  nextTermBegins: string | null;
  canEditHeadRemark: boolean;
  aiEnabled: boolean;
}) {
  const [state, action] = useActionState<RemarkState, FormData>(
    saveReportCardAction,
    {},
  );
  const [remark, setRemark] = useState(formTeacherRemark ?? "");
  const [drafting, startDraft] = useTransition();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="reportCardId" value={reportCardId} />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">Saved.</Alert> : null}

      <Field
        label="Form teacher's remark"
        htmlFor="formTeacherRemark"
        hint={`Written about ${studentName} and printed on the card.`}
      >
        <Textarea
          id="formTeacherRemark"
          name="formTeacherRemark"
          rows={3}
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          placeholder="Two or three sentences on progress, strengths and what to work on."
        />
      </Field>

      {aiEnabled ? (
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
              <Sparkles className="size-3.5 text-[var(--primary)]" />
              Suggested draft
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={drafting}
              onClick={() =>
                startDraft(async () => {
                  await draftRemarkAction(reportCardId);
                })
              }
            >
              <Wand2 className="size-3.5" />
              {drafting ? "Writing…" : aiRemark ? "Rewrite" : "Draft with AI"}
            </Button>
          </div>

          {aiRemark ? (
            <>
              <p className="mt-2 text-sm text-[var(--text-muted)] italic">
                &ldquo;{aiRemark}&rdquo;
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setRemark(aiRemark)}
              >
                Use this wording
              </Button>
            </>
          ) : (
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Claude will read this student&apos;s subject results and attendance and
              suggest a remark for you to edit.
            </p>
          )}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Conduct" htmlFor="conduct">
          <Input id="conduct" name="conduct" defaultValue={conduct ?? ""} />
        </Field>
        <Field label="Attitude" htmlFor="attitude">
          <Input id="attitude" name="attitude" defaultValue={attitude ?? ""} />
        </Field>
        <Field label="Interest" htmlFor="interest">
          <Input id="interest" name="interest" defaultValue={interest ?? ""} />
        </Field>
      </div>

      <Field label="Co-curricular activities" htmlFor="activities">
        <Input id="activities" name="activities" defaultValue={activities ?? ""} />
      </Field>

      {canEditHeadRemark ? (
        <Field label="Head teacher's remark" htmlFor="headTeacherRemark">
          <Textarea
            id="headTeacherRemark"
            name="headTeacherRemark"
            rows={2}
            defaultValue={headTeacherRemark ?? ""}
          />
        </Field>
      ) : (
        <input type="hidden" name="headTeacherRemark" value={headTeacherRemark ?? ""} />
      )}

      <Field label="Next term begins" htmlFor="nextTermBegins">
        <Input
          id="nextTermBegins"
          name="nextTermBegins"
          type="date"
          defaultValue={nextTermBegins ?? ""}
        />
      </Field>

      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Save className="size-4" />
      {pending ? "Saving…" : "Save report card"}
    </Button>
  );
}
