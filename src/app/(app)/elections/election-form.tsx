"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import {
  Alert,
  Button,
  CardBody,
  CheckboxField,
  Field,
  Input,
  Textarea,
} from "@/components/ui";

import { createElectionAction, type ElectionState } from "./actions";

export function ElectionForm() {
  const [state, action] = useActionState<ElectionState, FormData>(
    createElectionAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? (
          <Alert tone="success">
            Election created as a draft. Add candidates, then open voting.
          </Alert>
        ) : null}

        <Field label="Title" htmlFor="title" required>
          <Input
            id="title"
            name="title"
            required
            placeholder="SRC General Election 2026"
          />
        </Field>

        <Field label="Type" htmlFor="kind">
          <SearchableSelect
            id="kind"
            name="kind"
            clearable={false}
            defaultValue="SRC"
            options={[
              { value: "SRC", label: "SRC" },
              { value: "CLASS_REP", label: "Class representative" },
              { value: "PREFECT", label: "Prefectorial" },
              { value: "HOUSE", label: "House" },
              { value: "STAFF", label: "Staff" },
              { value: "PTA", label: "PTA" },
              { value: "CUSTOM", label: "Other" },
            ]}
          />
        </Field>

        <Field label="Description" htmlFor="description">
          <Textarea id="description" name="description" rows={2} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Voting opens" htmlFor="opensAt" required>
            <Input id="opensAt" name="opensAt" type="datetime-local" required />
          </Field>
          <Field label="Voting closes" htmlFor="closesAt" required>
            <Input id="closesAt" name="closesAt" type="datetime-local" required />
          </Field>
        </div>

        <Field label="Who may vote" htmlFor="eligiblePortals">
          <SearchableSelect
            id="eligiblePortals"
            name="eligiblePortals"
            multiple
            defaultValue={["STUDENT"]}
            options={[
              { value: "STUDENT", label: "Students" },
              { value: "STAFF", label: "Staff" },
              { value: "GUARDIAN", label: "Parents and guardians" },
            ]}
          />
        </Field>

        <Field
          label="Positions"
          htmlFor="positions"
          hint="One per line. Candidates are added after the election is created."
          required
        >
          <Textarea
            id="positions"
            name="positions"
            rows={4}
            required
            defaultValue={"President\nVice President\nGeneral Secretary"}
          />
        </Field>

        <Field label="Instructions to voters" htmlFor="instructions">
          <Textarea
            id="instructions"
            name="instructions"
            rows={2}
            placeholder="Select one candidate for each position, then submit. A ballot cannot be changed."
          />
        </Field>

        <div className="space-y-2">
          <CheckboxField
            name="isSecret"
            defaultChecked
            label="Secret ballot"
            description="Records that a person voted, never how."
          />
          <CheckboxField
            name="showLiveResults"
            defaultChecked
            label="Show a live tally while voting is open"
          />
          <CheckboxField
            name="allowAbstain"
            defaultChecked
            label="Allow voters to abstain on a position"
          />
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
      <Plus className="size-4" />
      {pending ? "Creating…" : "Create election"}
    </Button>
  );
}
