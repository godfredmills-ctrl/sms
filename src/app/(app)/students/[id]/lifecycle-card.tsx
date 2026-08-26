"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRightLeft, DoorOpen } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Textarea,
} from "@/components/ui";

import {
  setStudentLifecycleAction,
  transferStudentClassAction,
  type StudentState,
} from "../actions";
import { LIFECYCLE_TRANSITIONS } from "../lifecycle";

/**
 * The rest of a student's life at the school: a change of class, and the
 * ways a record ends or pauses.
 *
 * Kept off the edit form deliberately. Withdrawing a child is not a field —
 * it takes a reason and a date, it closes their enrolment, and it takes them
 * off the registers and the billing run. A decision like that should look
 * like a decision.
 */
export function LifecycleCard({
  studentId,
  status,
  currentClass,
  sections,
  canTransfer,
  only,
}: {
  studentId: string;
  status: string;
  currentClass: string | null;
  sections: SelectOption[];
  canTransfer: boolean;
  /**
   * Render one half of this card rather than both.
   *
   * The students table opens these same two forms from a row, and a row has
   * room for one thing at a time. Reusing this component rather than building
   * a second pair of forms in the table is the point: withdrawing a child
   * needs a reason, a date and sometimes the name of the receiving school, and
   * two implementations of that would drift apart on the first change.
   */
  only?: "transfer" | "status";
}) {
  const [state, action] = useActionState<StudentState, FormData>(
    setStudentLifecycleAction,
    {},
  );
  const [transferState, transferAction] = useActionState<StudentState, FormData>(
    transferStudentClassAction,
    {},
  );
  const [choice, setChoice] = useState("");

  const transition = LIFECYCLE_TRANSITIONS.find((entry) => entry.value === choice);
  const options = LIFECYCLE_TRANSITIONS.filter((entry) =>
    // Only offer what is actually a change from here.
    entry.value !== status,
  ).map((entry) => ({
    value: entry.value,
    label: entry.label,
    description: entry.description,
  }));

  const show = (part: "transfer" | "status") => !only || only === part;

  return (
    <div className="space-y-4">
      {show("transfer") && canTransfer && status === "ENROLLED" ? (
        <Card>
          <CardHeader
            title="Move to another class"
            description={
              currentClass ? `Currently in ${currentClass}.` : "No active class."
            }
          />
          <form action={transferAction}>
            <CardBody className="space-y-3">
              <input type="hidden" name="id" value={studentId} />
              {transferState.error ? (
                <Alert tone="danger">{transferState.error}</Alert>
              ) : null}
              {transferState.ok ? (
                <Alert tone="success">{transferState.message}</Alert>
              ) : null}

              <Field label="New class" htmlFor="transfer-section" required>
                <SearchableSelect
                  id="transfer-section"
                  name="classSectionId"
                  options={sections}
                  required
                />
              </Field>
              <TransferSubmit />
            </CardBody>
          </form>
        </Card>
      ) : null}

      {show("status") ? (
      <Card>
        <CardHeader
          title="Change of status"
          description="Leaving, suspension, or coming back."
        />
        <form action={action}>
          <CardBody className="space-y-3">
            <input type="hidden" name="id" value={studentId} />
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
            {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

            <Field label="What is happening" htmlFor="lifecycle-status" required>
              <SearchableSelect
                id="lifecycle-status"
                name="status"
                options={options}
                value={choice}
                onChange={(value) => setChoice((value as string) ?? "")}
                required
              />
            </Field>

            {transition ? (
              <>
                <Field
                  label="Effective from"
                  htmlFor="lifecycle-date"
                  hint="Blank means today. The change takes effect when you save it."
                >
                  <Input id="lifecycle-date" name="effectiveOn" type="date" />
                </Field>

                {/* Coming back needs a class to come back to: the enrolment
                    is what puts them on a register and into billing. */}
                {choice === "ENROLLED" ? (
                  <Field
                    label="Class they return to"
                    htmlFor="lifecycle-section"
                    hint={
                      currentClass
                        ? `Leave blank to put them back in ${currentClass}.`
                        : "Required: they have no class to return to."
                    }
                  >
                    <SearchableSelect
                      id="lifecycle-section"
                      name="classSectionId"
                      options={sections}
                    />
                  </Field>
                ) : null}

                {transition.endsEnrolment ? (
                  <>
                    <Field label="Reason" htmlFor="lifecycle-reason" required>
                      <Textarea
                        id="lifecycle-reason"
                        name="reason"
                        rows={2}
                        required
                        placeholder="Family relocating to Kumasi."
                      />
                    </Field>
                    {choice === "TRANSFERRED_OUT" ? (
                      <Field label="Moving to" htmlFor="lifecycle-destination">
                        <Input
                          id="lifecycle-destination"
                          name="transferredTo"
                          placeholder="Name of the new school"
                        />
                      </Field>
                    ) : null}
                    <Alert tone="warning">
                      This closes their enrolment: they come off the class register,
                      out of the headcount, and out of the next billing run.
                    </Alert>
                  </>
                ) : (
                  <Field label="Note" htmlFor="lifecycle-note">
                    <Textarea id="lifecycle-note" name="reason" rows={2} />
                  </Field>
                )}
              </>
            ) : null}

            <StatusSubmit disabled={!transition} endsEnrolment={transition?.endsEnrolment} />
          </CardBody>
        </form>
      </Card>
      ) : null}
    </div>
  );
}

function TransferSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      <ArrowRightLeft className="size-4" />
      {pending ? "Moving…" : "Move class"}
    </Button>
  );
}

function StatusSubmit({
  disabled,
  endsEnrolment,
}: {
  disabled: boolean;
  endsEnrolment?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={endsEnrolment ? "danger" : "outline"}
      className="w-full"
      disabled={pending || disabled}
    >
      <DoorOpen className="size-4" />
      {pending ? "Recording…" : "Record this"}
    </Button>
  );
}
