"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { UserPlus } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  Field,
  Input,
  Textarea,
} from "@/components/ui";

import { MESSAGE_CHANNELS } from "@/lib/audiences";

import { admitStudentAction, type AdmissionState } from "../actions";

const REGIONS = [
  "Greater Accra",
  "Ashanti",
  "Western",
  "Western North",
  "Central",
  "Eastern",
  "Volta",
  "Oti",
  "Northern",
  "Savannah",
  "North East",
  "Upper East",
  "Upper West",
  "Bono",
  "Bono East",
  "Ahafo",
].map((region) => ({ value: region, label: region }));

export function AdmissionForm({ sections }: { sections: SelectOption[] }) {
  const [state, action] = useActionState<AdmissionState, FormData>(
    admitStudentAction,
    {},
  );

  if (state.ok) {
    return (
      <Card>
        <CardBody className="py-12 text-center">
          <h2 className="text-lg font-semibold">{state.message}</h2>
          <p className="numeric mt-3 inline-block rounded-lg border border-dashed border-[var(--border-strong)] px-4 py-2 text-lg font-semibold">
            {state.admissionNo}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              href={`/students/${state.studentId}`}
              className="inline-flex h-9 items-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white hover:opacity-90"
            >
              Open the profile
            </Link>
            <Link
              href="/students/new"
              className="inline-flex h-9 items-center rounded-lg border border-[var(--border-strong)] px-4 text-sm font-medium hover:bg-[var(--bg-subtle)]"
            >
              Admit another
            </Link>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Card>
        <CardHeader title="The student" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" required>
            <Input id="firstName" name="firstName" required />
          </Field>
          <Field label="Last name" htmlFor="lastName" required>
            <Input id="lastName" name="lastName" required />
          </Field>
          <Field label="Other names" htmlFor="otherNames">
            <Input id="otherNames" name="otherNames" />
          </Field>
          <Field label="Preferred name" htmlFor="preferredName">
            <Input id="preferredName" name="preferredName" />
          </Field>
          <Field label="Gender" htmlFor="gender">
            <SearchableSelect
              id="gender"
              name="gender"
              clearable={false}
              defaultValue="UNDISCLOSED"
              options={[
                { value: "MALE", label: "Male" },
                { value: "FEMALE", label: "Female" },
                { value: "OTHER", label: "Other" },
                { value: "UNDISCLOSED", label: "Prefer not to say" },
              ]}
            />
          </Field>
          <Field label="Date of birth" htmlFor="dateOfBirth">
            <Input id="dateOfBirth" name="dateOfBirth" type="date" />
          </Field>
          <Field label="Place of birth" htmlFor="placeOfBirth">
            <Input id="placeOfBirth" name="placeOfBirth" />
          </Field>
          <Field
            label="Admission number"
            htmlFor="admissionNo"
            hint="Allocated automatically if blank."
          >
            <Input id="admissionNo" name="admissionNo" placeholder="ADM/2026/0001" />
          </Field>
          <Field label="Class" htmlFor="classSectionId" className="sm:col-span-2">
            <SearchableSelect
              id="classSectionId"
              name="classSectionId"
              options={sections}
              placeholder="Place in a class now, or later"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Guardian"
          description="A record with no contactable adult behind it is the gap that costs a school most — capture it now."
        />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" htmlFor="guardianFirstName">
            <Input id="guardianFirstName" name="guardianFirstName" />
          </Field>
          <Field label="Last name" htmlFor="guardianLastName">
            <Input id="guardianLastName" name="guardianLastName" />
          </Field>
          <Field label="Phone" htmlFor="guardianPhone" hint="Required if a guardian is named.">
            <Input id="guardianPhone" name="guardianPhone" placeholder="024 123 4567" />
          </Field>
          <Field label="Email" htmlFor="guardianEmail">
            <Input id="guardianEmail" name="guardianEmail" type="email" />
          </Field>
          <Field label="Relationship" htmlFor="guardianRelation">
            <SearchableSelect
              id="guardianRelation"
              name="guardianRelation"
              clearable={false}
              defaultValue="GUARDIAN"
              options={[
                { value: "MOTHER", label: "Mother" },
                { value: "FATHER", label: "Father" },
                { value: "GUARDIAN", label: "Guardian" },
                { value: "GRANDMOTHER", label: "Grandmother" },
                { value: "GRANDFATHER", label: "Grandfather" },
                { value: "AUNT", label: "Aunt" },
                { value: "UNCLE", label: "Uncle" },
                { value: "SPONSOR", label: "Sponsor" },
                { value: "OTHER", label: "Other" },
              ]}
            />
          </Field>
          <Field label="Occupation" htmlFor="guardianOccupation">
            <Input id="guardianOccupation" name="guardianOccupation" />
          </Field>
          <Field
            label="Prefers to be contacted by"
            htmlFor="guardianChannel"
            className="sm:col-span-2"
          >
            <SearchableSelect
              id="guardianChannel"
              name="guardianChannel"
              clearable={false}
              defaultValue="SMS"
              options={MESSAGE_CHANNELS}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contact and background" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Student phone" htmlFor="phone">
            <Input id="phone" name="phone" />
          </Field>
          <Field label="Student email" htmlFor="email">
            <Input id="email" name="email" type="email" />
          </Field>
          <Field label="Residential address" htmlFor="residentialAddress" className="sm:col-span-2">
            <Input id="residentialAddress" name="residentialAddress" />
          </Field>
          <Field label="City / town" htmlFor="city">
            <Input id="city" name="city" />
          </Field>
          <Field label="Region" htmlFor="region">
            <SearchableSelect id="region" name="region" options={REGIONS} />
          </Field>
          <Field label="Ghana Post GPS" htmlFor="digitalAddr">
            <Input id="digitalAddr" name="digitalAddr" placeholder="GA-183-4567" />
          </Field>
          <Field label="Nationality" htmlFor="nationality">
            <Input id="nationality" name="nationality" defaultValue="Ghanaian" />
          </Field>
          <Field label="Hometown" htmlFor="hometown">
            <Input id="hometown" name="hometown" />
          </Field>
          <Field label="Religion" htmlFor="religion">
            <Input id="religion" name="religion" />
          </Field>
          <Field label="Lives with" htmlFor="livingWith">
            <SearchableSelect
              id="livingWith"
              name="livingWith"
              options={[
                { value: "BOTH_PARENTS", label: "Both parents" },
                { value: "MOTHER", label: "Mother" },
                { value: "FATHER", label: "Father" },
                { value: "GUARDIAN", label: "Guardian" },
                { value: "RELATIVE", label: "A relative" },
                { value: "BOARDING", label: "Boarding house" },
              ]}
            />
          </Field>
          <Field label="Travels to school by" htmlFor="transportMode">
            <SearchableSelect
              id="transportMode"
              name="transportMode"
              options={[
                { value: "SCHOOL_BUS", label: "School bus" },
                { value: "PRIVATE", label: "Private car" },
                { value: "WALKING", label: "Walking" },
                { value: "TROTRO", label: "Trotro" },
                { value: "TAXI", label: "Taxi" },
              ]}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Medical and support"
          description="Allergies recorded here drive the red banner on the student's profile."
        />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Blood group" htmlFor="bloodGroup">
            <Input id="bloodGroup" name="bloodGroup" placeholder="O+" />
          </Field>
          <Field label="Allergies" htmlFor="allergies" hint="Comma separated">
            <Input id="allergies" name="allergies" placeholder="Peanuts, penicillin" />
          </Field>
          <Field
            label="Emergency instructions"
            htmlFor="emergencyInstructions"
            className="sm:col-span-2"
          >
            <Textarea id="emergencyInstructions" name="emergencyInstructions" rows={2} />
          </Field>
          <div className="space-y-2 sm:col-span-2">
            <CheckboxField
              name="isBoarder"
              label="Boarder"
              description="Boarding fees apply and the boarding fee structure is used."
            />
            <CheckboxField
              name="hasSpecialNeeds"
              label="Has additional learning needs"
              description="Adds the student to the SEN register."
            />
          </div>
          <Field label="Notes on additional needs" htmlFor="specialNeedsNotes" className="sm:col-span-2">
            <Textarea id="specialNeedsNotes" name="specialNeedsNotes" rows={2} />
          </Field>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      <UserPlus className="size-4" />
      {pending ? "Admitting…" : "Admit student"}
    </Button>
  );
}
