"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, ChevronRight } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, Card, CardBody, CardHeader, Field } from "@/components/ui";

import { setStudentStageAction, type StageState } from "./actions";

const STAGES = [
  { key: "APPLICANT", label: "Applicant" },
  { key: "OFFERED", label: "Offered" },
  { key: "ENROLLED", label: "Enrolled" },
] as const;

/**
 * Where this child is in the admission pipeline, and the button that moves
 * them one stage forward.
 *
 * Shown only while the student is an applicant or holds an offer — once they
 * are enrolled the pipeline is history and the profile is about school life.
 * One step at a time on purpose: an applicant can be offered a place, and an
 * offer can be enrolled, but nothing jumps from a web form to a class roll.
 */
export function AdmissionStageCard({
  studentId,
  status,
  sections,
}: {
  studentId: string;
  status: string;
  sections: SelectOption[];
}) {
  const [state, action] = useActionState<StageState, FormData>(
    setStudentStageAction,
    {},
  );
  const [enrolling, setEnrolling] = useState(false);

  const currentIndex = STAGES.findIndex((stage) => stage.key === status);

  return (
    <Card>
      <CardHeader
        title="Admission pipeline"
        description="Filling a form on the website makes nobody a student — these steps do."
      />
      <CardBody className="space-y-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <ol className="flex items-center gap-1">
          {STAGES.map((stage, index) => {
            const done = index < currentIndex;
            const current = index === currentIndex;
            return (
              <li key={stage.key} className="flex flex-1 items-center gap-1">
                <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span
                    className={`flex size-8 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? "bg-[var(--success)] text-white"
                        : current
                          ? "bg-[var(--primary)] text-[var(--primary-text)]"
                          : "bg-[var(--bg-subtle)] text-[var(--text-subtle)]"
                    }`}
                  >
                    {done ? <Check className="size-4" /> : index + 1}
                  </span>
                  <span
                    className={`text-[11px] ${
                      current ? "font-semibold" : "text-[var(--text-subtle)]"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
                {index < STAGES.length - 1 ? (
                  <ChevronRight className="size-4 shrink-0 text-[var(--text-subtle)]" />
                ) : null}
              </li>
            );
          })}
        </ol>

        {status === "APPLICANT" && !enrolling ? (
          <div className="flex flex-wrap gap-2">
            <form action={action} className="flex-1">
              <input type="hidden" name="id" value={studentId} />
              <input type="hidden" name="stage" value="OFFERED" />
              <Submit label="Offer a place" busy="Offering…" />
            </form>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setEnrolling(true)}
            >
              Enrol directly
            </Button>
          </div>
        ) : null}

        {status === "OFFERED" || enrolling ? (
          <form action={action} className="space-y-3">
            <input type="hidden" name="id" value={studentId} />
            <input type="hidden" name="stage" value="ENROLLED" />
            <Field
              label="Class"
              htmlFor="stage-class"
              hint="Enrolling puts them on this class's roll from today."
              required
            >
              <SearchableSelect
                id="stage-class"
                name="classSectionId"
                options={sections}
                required
              />
            </Field>
            <Submit label="Enrol" busy="Enrolling…" />
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className="w-full" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}
