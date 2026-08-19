"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Printer, UserPlus } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  CardBody,
  Field,
  Input,
  LinkButton,
  Select,
  Textarea,
} from "@/components/ui";

import { signInVisitorAction, type VisitorState } from "./actions";

const CATEGORIES = [
  { value: "PARENT", label: "Parent or guardian" },
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "INSPECTOR", label: "Inspector or official" },
  { value: "SUPPLIER", label: "Supplier or delivery" },
  { value: "GUEST", label: "Guest" },
  { value: "OTHER", label: "Other" },
];

const ID_TYPES = [
  { value: "", label: "None sighted" },
  { value: "Ghana Card", label: "Ghana Card" },
  { value: "Passport", label: "Passport" },
  { value: "Driver's licence", label: "Driver's licence" },
  { value: "Voter ID", label: "Voter ID" },
  { value: "Staff ID", label: "Company or staff ID" },
];

/**
 * The desk's form.
 *
 * Two required fields and everything else optional, arranged so the common
 * visit — a parent here to collect a child — is four taps. The detail a
 * safeguarding audit asks for later (identification sighted, vehicle) is
 * behind a disclosure, present but not in the way of a queue.
 */
export function SignInForm({
  staff,
  students,
}: {
  staff: SelectOption[];
  students: SelectOption[];
}) {
  const [state, action] = useActionState<VisitorState, FormData>(signInVisitorAction, {});
  const [showMore, setShowMore] = useState(false);

  // Remount on success: the searchable selects keep their choice in their own
  // state, where a form.reset() cannot reach it.
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (state.ok) {
      setFormKey((key) => key + 1);
      setShowMore(false);
    }
  }, [state]);

  return (
    <form key={formKey} action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok && state.passNo ? (
          <Alert tone="success">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Signed in — pass <strong className="numeric">{state.passNo}</strong>.
              </span>
              <LinkButton
                href={`/api/visitor-passes?pass=${encodeURIComponent(state.passNo)}`}
                target="_blank"
                size="sm"
                variant="secondary"
              >
                <Printer className="size-4" />
                Print pass
              </LinkButton>
            </div>
          </Alert>
        ) : null}

        <Field label="Name" htmlFor="visitor-name" required>
          <Input id="visitor-name" name="fullName" autoComplete="off" required />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="They are a" htmlFor="visitor-category">
            <Select id="visitor-category" name="category" defaultValue="PARENT">
              {CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Phone" htmlFor="visitor-phone">
            <Input id="visitor-phone" name="phone" inputMode="tel" autoComplete="off" />
          </Field>
        </div>

        <Field label="Here for" htmlFor="visitor-purpose" required>
          <Input
            id="visitor-purpose"
            name="purpose"
            placeholder="Collecting a child, meeting, delivery…"
            required
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Seeing" htmlFor="visitor-host" hint="Leave blank for reception.">
            <SearchableSelect
              id="visitor-host"
              name="hostStaffId"
              options={staff}
              placeholder="Member of staff…"
              searchPlaceholder="Name or department…"
            />
          </Field>
          <Field label="About" htmlFor="visitor-student" hint="A child, where it is about one.">
            <SearchableSelect
              id="visitor-student"
              name="aboutStudentId"
              options={students}
              placeholder="Student…"
              searchPlaceholder="Name or admission number…"
            />
          </Field>
        </div>

        {showMore ? (
          <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Organisation" htmlFor="visitor-org">
                <Input id="visitor-org" name="organisation" autoComplete="off" />
              </Field>
              <Field label="Vehicle" htmlFor="visitor-vehicle">
                <Input
                  id="visitor-vehicle"
                  name="vehicleReg"
                  placeholder="GT 1234-25"
                  className="uppercase"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ID sighted" htmlFor="visitor-id-type">
                <Select id="visitor-id-type" name="idType">
                  {ID_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="ID number"
                htmlFor="visitor-id-number"
                hint="The last few digits are enough."
              >
                <Input id="visitor-id-number" name="idNumber" autoComplete="off" />
              </Field>
            </div>
            <Field label="Note" htmlFor="visitor-notes">
              <Textarea id="visitor-notes" name="notes" rows={2} />
            </Field>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="text-xs font-medium text-[var(--primary)]"
          >
            Add ID, vehicle or a note
          </button>
        )}

        <SubmitButton />
      </CardBody>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      <UserPlus className="size-4" />
      {pending ? "Signing in…" : "Sign in and issue a pass"}
    </Button>
  );
}
