"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Send, Undo2 } from "lucide-react";

import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, Textarea } from "@/components/ui";
import {
  SECTIONS,
  allowedTransitions,
  completeness,
  editable,
  missingSections,
  reflectionEditable,
} from "@/lib/lesson-notes";

import {
  moveLessonNoteAction,
  saveLessonNoteAction,
  saveReflectionAction,
  type NoteState,
} from "./actions";

export type NoteValues = {
  id: string | null;
  offeringId: string;
  weekNumber: number;
  status: string;
  topic: string;
  subTopic: string;
  objectives: string;
  rpk: string;
  materials: string;
  coreCompetencies: string;
  introduction: string;
  development: string;
  closure: string;
  evaluation: string;
  homework: string;
  reflection: string;
  periodsPlanned: number;
  vetterRemarks: string | null;
};

function Submit({ label, icon }: { label: string; icon?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {pending ? "Saving…" : label}
    </Button>
  );
}

/**
 * The note, in the order the paper form asks for it.
 *
 * Deliberately one long form rather than a wizard. A teacher writing a note has
 * the syllabus open beside them and moves back and forth between the objectives
 * and the activities; a wizard that hides the objectives while they write the
 * development is a wizard they will fill in twice.
 */
export function NoteForm({
  values,
  subject,
  section,
  weekEnding,
  mine,
  mayVet,
}: {
  values: NoteValues;
  subject: string;
  section: string;
  weekEnding: string;
  mine: boolean;
  mayVet: boolean;
}) {
  const router = useRouter();
  const [state, action] = useActionState<NoteState, FormData>(saveLessonNoteAction, {});

  // What is still empty, updated as they type rather than only on save. The
  // same function the action uses to decide whether to accept a submission, so
  // the form cannot say "ready" and the server disagree.
  const [draft, setDraft] = useState(values);
  const missing = missingSections({
    ...draft,
    objectives: draft.objectives.split("\n"),
    materials: draft.materials.split("\n"),
    coreCompetencies: draft.coreCompetencies.split("\n"),
  });

  useEffect(() => {
    if (state.ok && state.noteId && !values.id) {
      router.replace(`/lesson-notes/${state.noteId}`);
    } else if (state.ok) {
      router.refresh();
    }
  }, [state.ok, state.noteId, values.id, router]);

  const open = editable(values.status);
  const percent = completeness({
    ...draft,
    objectives: draft.objectives.split("\n"),
    materials: draft.materials.split("\n"),
    coreCompetencies: draft.coreCompetencies.split("\n"),
  });

  const set = (key: keyof NoteValues) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-4">
      {values.status === "RETURNED" && values.vetterRemarks ? (
        <Alert tone="warning">
          <span className="block font-medium">This note was sent back.</span>
          <span className="block">{values.vetterRemarks}</span>
        </Alert>
      ) : null}

      {!open && mine ? (
        <Alert tone="info">
          {values.status === "SUBMITTED"
            ? "This note is with the head for vetting, so it cannot be edited. The reflection is still open, because it is written after the teaching."
            : "This note has been approved. The reflection is still open; anything else needs it reopened."}
        </Alert>
      ) : null}

      {open ? (
        <form action={action} className="space-y-4">
          <input type="hidden" name="offeringId" value={values.offeringId} />
          <input type="hidden" name="weekNumber" value={values.weekNumber} />

          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <Card>
            <CardHeader
              title="The week"
              description={`${subject}, ${section}. Week ${values.weekNumber}, ending ${weekEnding}.`}
              action={
                <Badge tone={missing.length ? "warning" : "success"}>
                  {percent}% filled in
                </Badge>
              }
            />
            <CardBody className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Topic" htmlFor="topic" required className="sm:col-span-2">
                  <Input
                    id="topic"
                    name="topic"
                    required
                    defaultValue={values.topic}
                    onChange={(event) => set("topic")(event.target.value)}
                    placeholder="Photosynthesis"
                  />
                </Field>
                <Field label="Periods" htmlFor="periodsPlanned" hint="How many this covers.">
                  <Input
                    id="periodsPlanned"
                    name="periodsPlanned"
                    type="number"
                    min="0"
                    max="50"
                    defaultValue={String(values.periodsPlanned)}
                  />
                </Field>
              </div>

              <Field label="Sub-topic" htmlFor="subTopic">
                <Input
                  id="subTopic"
                  name="subTopic"
                  defaultValue={values.subTopic}
                  onChange={(event) => set("subTopic")(event.target.value)}
                  placeholder="The role of chlorophyll"
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="What the pupils will do"
              description="One to a line where a list is asked for."
            />
            <CardBody className="space-y-3">
              <Field
                label="Objectives"
                htmlFor="objectives"
                required
                hint="By the end of the lesson the pupil will be able to..."
              >
                <Textarea
                  id="objectives"
                  name="objectives"
                  rows={3}
                  defaultValue={values.objectives}
                  onChange={(event) => set("objectives")(event.target.value)}
                  placeholder={"State what a plant needs to make food\nDescribe the starch test"}
                />
              </Field>

              <Field
                label="Relevant previous knowledge"
                htmlFor="rpk"
                required
                hint="What the class is assumed to know already."
              >
                <Textarea
                  id="rpk"
                  name="rpk"
                  rows={2}
                  defaultValue={values.rpk}
                  onChange={(event) => set("rpk")(event.target.value)}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Teaching and learning materials" htmlFor="materials" required>
                  <Textarea
                    id="materials"
                    name="materials"
                    rows={3}
                    defaultValue={values.materials}
                    onChange={(event) => set("materials")(event.target.value)}
                    placeholder={"Green leaves\nIodine solution"}
                  />
                </Field>
                <Field label="Core competencies" htmlFor="coreCompetencies">
                  <Textarea
                    id="coreCompetencies"
                    name="coreCompetencies"
                    rows={3}
                    defaultValue={values.coreCompetencies}
                    onChange={(event) => set("coreCompetencies")(event.target.value)}
                    placeholder={"Critical thinking\nCollaboration"}
                  />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="The lesson" description="The three phases, as the form asks." />
            <CardBody className="space-y-3">
              <Field label="Introduction" htmlFor="introduction" required>
                <Textarea
                  id="introduction"
                  name="introduction"
                  rows={3}
                  defaultValue={values.introduction}
                  onChange={(event) => set("introduction")(event.target.value)}
                />
              </Field>
              <Field label="Development" htmlFor="development" required>
                <Textarea
                  id="development"
                  name="development"
                  rows={5}
                  defaultValue={values.development}
                  onChange={(event) => set("development")(event.target.value)}
                />
              </Field>
              <Field label="Closure" htmlFor="closure" required>
                <Textarea
                  id="closure"
                  name="closure"
                  rows={3}
                  defaultValue={values.closure}
                  onChange={(event) => set("closure")(event.target.value)}
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Afterwards" />
            <CardBody className="space-y-3">
              <Field
                label="Evaluation"
                htmlFor="evaluation"
                required
                hint="The exercise that shows whether the objectives were met."
              >
                <Textarea
                  id="evaluation"
                  name="evaluation"
                  rows={3}
                  defaultValue={values.evaluation}
                  onChange={(event) => set("evaluation")(event.target.value)}
                />
              </Field>
              <Field label="Homework" htmlFor="homework">
                <Textarea
                  id="homework"
                  name="homework"
                  rows={2}
                  defaultValue={values.homework}
                  onChange={(event) => set("homework")(event.target.value)}
                />
              </Field>
              {/* Carried through the save so it is not lost, but written on its
                  own form below once the note has been handed in. */}
              <input type="hidden" name="reflection" value={draft.reflection} />
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--text-muted)]">
              {missing.length
                ? `Still empty: ${missing.join(", ")}.`
                : "Everything the form asks for is filled in."}
            </p>
            <Submit label="Save" icon={<Check className="size-3.5" />} />
          </div>
        </form>
      ) : null}

      {values.id ? (
        <Moves
          id={values.id}
          status={values.status}
          mine={mine}
          mayVet={mayVet}
          ready={missing.length === 0}
        />
      ) : null}

      {values.id && mine && reflectionEditable(values.status) ? (
        <Reflection id={values.id} value={values.reflection} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The buttons, drawn from the same table the action checks against.
 *
 * A teacher never sees Approve, and a teacher who is also a head of department
 * never sees it on their own note, because the action refuses that outright.
 */
function Moves({
  id,
  status,
  mine,
  mayVet,
  ready,
}: {
  id: string;
  status: string;
  mine: boolean;
  mayVet: boolean;
  ready: boolean;
}) {
  const router = useRouter();
  const [state, action] = useActionState<NoteState, FormData>(moveLessonNoteAction, {});
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const asTeacher = mine ? allowedTransitions(status, "teacher") : [];
  // Vetting your own note is refused by the action, so the button is not drawn.
  const asVetter = mayVet && !mine ? allowedTransitions(status, "vetter") : [];

  if (!asTeacher.length && !asVetter.length) return null;

  return (
    <Card>
      <CardHeader title="What happens next" />
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        {mine && mayVet ? (
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            You can vet lesson notes, but not your own. Somebody else has to look
            at this one, which is the point of vetting it.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {asTeacher.map((move) => (
            <form key={move.to} action={action}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="to" value={move.to} />
              <SubmitMove label={move.label} disabled={!ready} icon={<Send className="size-3.5" />} />
            </form>
          ))}

          {asVetter
            .filter((move) => move.to !== "RETURNED")
            .map((move) => (
              <form key={move.to} action={action}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="to" value={move.to} />
                <SubmitMove
                  label={move.label}
                  icon={move.to === "APPROVED" ? <Check className="size-3.5" /> : <Undo2 className="size-3.5" />}
                />
              </form>
            ))}

          {asVetter.some((move) => move.to === "RETURNED") && !returning ? (
            <Button size="sm" variant="outline" onClick={() => setReturning(true)}>
              <Undo2 className="size-3.5" />
              Send back
            </Button>
          ) : null}
        </div>

        {!ready && asTeacher.length ? (
          <p className="text-xs text-[var(--warning)]">
            Fill in everything the form asks for before handing it in.
          </p>
        ) : null}

        {returning ? (
          <form action={action} className="space-y-2 border-t border-[var(--border)] pt-3">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="to" value="RETURNED" />
            <Field
              label="What needs changing"
              htmlFor="vetterRemarks"
              required
              hint="The teacher sees this. A note sent back without a reason comes back three times."
            >
              <Textarea id="vetterRemarks" name="vetterRemarks" rows={3} required />
            </Field>
            <div className="flex gap-2">
              <SubmitMove label="Send it back" icon={<Undo2 className="size-3.5" />} />
              <Button size="sm" variant="ghost" onClick={() => setReturning(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}

function SubmitMove({
  label,
  icon,
  disabled,
}: {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || disabled}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {pending ? "Working…" : label}
    </Button>
  );
}

// ---------------------------------------------------------------------------

function Reflection({ id, value }: { id: string; value: string }) {
  const router = useRouter();
  const [state, action] = useActionState<NoteState, FormData>(saveReflectionAction, {});

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <Card>
      <CardHeader
        title="Reflection"
        description="Written after the week, not before. How the teaching actually went."
      />
      <CardBody>
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

          <Textarea
            name="reflection"
            rows={4}
            defaultValue={value}
            placeholder="The starch test took longer than planned; the second class did not reach the evaluation."
          />
          <Submit label="Save the reflection" icon={<Check className="size-3.5" />} />
        </form>
      </CardBody>
    </Card>
  );
}

/** The sections, exported so the printed note and the form stay in step. */
export { SECTIONS };
