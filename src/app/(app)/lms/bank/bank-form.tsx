"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Library } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  CardBody,
  Field,
  Input,
  Textarea,
} from "@/components/ui";

import { saveBankQuestionAction, type BankState } from "./actions";

const QUESTION_TYPES = [
  { value: "MULTIPLE_CHOICE", label: "Multiple choice — one correct" },
  { value: "MULTIPLE_ANSWER", label: "Multiple answer — several correct" },
  { value: "TRUE_FALSE", label: "True or false" },
  { value: "SHORT_ANSWER", label: "Short answer" },
  { value: "FILL_BLANK", label: "Fill in the blank" },
];

/** Same fields as the quiz screen's form — both feed one parser. */
export function BankQuestionForm({ subjects }: { subjects: SelectOption[] }) {
  const [state, action] = useActionState<BankState, FormData>(
    saveBankQuestionAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Subject shelf" htmlFor="bank-subject" hint="Where it files.">
          <SearchableSelect id="bank-subject" name="subjectId" options={subjects} />
        </Field>

        <Field label="Question" htmlFor="bank-prompt" required>
          <Textarea id="bank-prompt" name="prompt" rows={2} required />
        </Field>

        <Field label="Type" htmlFor="bank-type">
          <SearchableSelect
            id="bank-type"
            name="type"
            clearable={false}
            defaultValue="MULTIPLE_CHOICE"
            options={QUESTION_TYPES}
          />
        </Field>

        <Field
          label="Options"
          htmlFor="bank-options"
          hint="One per line. Prefix the correct one(s) with *"
        >
          <Textarea
            id="bank-options"
            name="options"
            rows={4}
            placeholder={"*Accra\nKumasi\nTakoradi\nTamale"}
          />
        </Field>

        <Field
          label="True/false answer"
          htmlFor="bank-correct"
          hint="Only used for a true-or-false question."
        >
          <SearchableSelect
            id="bank-correct"
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
          htmlFor="bank-accepted"
          hint="Short answer only. Comma separated."
        >
          <Input id="bank-accepted" name="acceptedAnswers" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Marks" htmlFor="bank-points">
            <Input
              id="bank-points"
              name="points"
              type="number"
              min="0.5"
              step="0.5"
              defaultValue={1}
            />
          </Field>
          <Field label="Explanation" htmlFor="bank-explanation" hint="Shown after marking.">
            <Input id="bank-explanation" name="explanation" />
          </Field>
        </div>

        <Submit />
      </CardBody>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      <Library className="size-4" />
      {pending ? "Filing…" : "File in the bank"}
    </Button>
  );
}
