"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Save, UserPlus } from "lucide-react";

import { DocumentsField } from "@/components/documents-field";
import { ImageField } from "@/components/image-field";
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

import { createStaffAction, updateStaffAction, type StaffState } from "./actions";

const GENDERS = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
  { value: "OTHER", label: "Other" },
  { value: "UNDISCLOSED", label: "Prefer not to say" },
];

const EMPLOYMENT_TYPES = [
  { value: "FULL_TIME", label: "Full time" },
  { value: "PART_TIME", label: "Part time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "NATIONAL_SERVICE", label: "National service" },
  { value: "INTERN", label: "Intern" },
  { value: "VOLUNTEER", label: "Volunteer" },
];

export type StaffValues = {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  otherNames: string;
  gender: string;
  dateOfBirth: string;
  photoUrl: string;
  email: string;
  phone: string;
  altPhone: string;
  address: string;
  digitalAddr: string;
  nationality: string;
  nationalId: string;
  ssnitNumber: string;
  tin: string;
  jobTitle: string;
  department: string;
  employmentType: string;
  hireDate: string;
  isTeaching: boolean;
  specialisations: string[];
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  notes: string;
};

/**
 * One form for adding and for editing.
 *
 * The alternative is two, which start identical and stop being identical the
 * first time a field is added to one of them — and the half that silently
 * stops saving is always the edit screen, because nobody checks an edit screen
 * for a field that was never there.
 */
export function StaffForm({
  subjects,
  documentCategories = [],
  values,
  onSuccess,
}: {
  subjects: SelectOption[];
  /** From DOCUMENT_CATEGORIES.staff; empty hides the documents card. */
  documentCategories?: Array<{ value: string; label: string }>;
  values?: StaffValues;
  /** Lets a modal close itself once the record is saved. */
  onSuccess?: () => void;
}) {
  const editing = Boolean(values?.id);
  const [state, action] = useActionState<StaffState, FormData>(
    editing ? updateStaffAction : createStaffAction,
    {},
  );

  useEffect(() => {
    if (state.ok) onSuccess?.();
  }, [state.ok, onSuccess]);

  return (
    <form action={action} className="space-y-4">
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="success">
          {state.message ??
            `Added${state.staffNo ? `: staff number ${state.staffNo}` : ""}.`}
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Identity" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" defaultValue={values?.title} placeholder="Mrs" />
          </Field>
          <Field label="Gender" htmlFor="gender">
            <SearchableSelect
              id="gender"
              name="gender"
              clearable={false}
              defaultValue={values?.gender ?? "UNDISCLOSED"}
              options={GENDERS}
            />
          </Field>
          <Field label="First name" htmlFor="firstName" required>
            <Input id="firstName" name="firstName" required defaultValue={values?.firstName} />
          </Field>
          <Field label="Last name" htmlFor="lastName" required>
            <Input id="lastName" name="lastName" required defaultValue={values?.lastName} />
          </Field>
          <Field label="Other names" htmlFor="otherNames">
            <Input id="otherNames" name="otherNames" defaultValue={values?.otherNames} />
          </Field>
          <Field label="Date of birth" htmlFor="dateOfBirth">
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              defaultValue={values?.dateOfBirth}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Photograph" htmlFor="photoUrl">
              <ImageField id="photoUrl" name="photoUrl" defaultValue={values?.photoUrl} visibility="private" />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Employment" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Job title" htmlFor="jobTitle">
            <Input
              id="jobTitle"
              name="jobTitle"
              defaultValue={values?.jobTitle}
              placeholder="Teacher of Mathematics"
            />
          </Field>
          <Field label="Department" htmlFor="department">
            <Input id="department" name="department" defaultValue={values?.department} />
          </Field>
          <Field label="Employment type" htmlFor="employmentType">
            <SearchableSelect
              id="employmentType"
              name="employmentType"
              clearable={false}
              defaultValue={values?.employmentType ?? "FULL_TIME"}
              options={EMPLOYMENT_TYPES}
            />
          </Field>
          <Field label="Hire date" htmlFor="hireDate">
            <Input id="hireDate" name="hireDate" type="date" defaultValue={values?.hireDate} />
          </Field>
          <div className="sm:col-span-2">
            <CheckboxField
              name="isTeaching"
              defaultChecked={values ? values.isTeaching : true}
              label="Teaching staff"
              description="Teaching staff can be assigned classes, take registers and enter marks."
            />
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Subjects taught"
              htmlFor="specialisations"
              hint="Used when assigning classes."
            >
              <SearchableSelect
                id="specialisations"
                name="specialisations"
                multiple
                defaultValue={values?.specialisations ?? []}
                options={subjects}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contact" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={values?.email} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={values?.phone} placeholder="024 123 4567" />
          </Field>
          <Field label="Alternative phone" htmlFor="altPhone">
            <Input id="altPhone" name="altPhone" defaultValue={values?.altPhone} />
          </Field>
          <Field label="Digital address" htmlFor="digitalAddr">
            <Input id="digitalAddr" name="digitalAddr" defaultValue={values?.digitalAddr} placeholder="GA-123-4567" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Residential address" htmlFor="address">
              <Input id="address" name="address" defaultValue={values?.address} />
            </Field>
          </div>
          <Field label="Nationality" htmlFor="nationality">
            <Input
              id="nationality"
              name="nationality"
              defaultValue={values?.nationality ?? "Ghanaian"}
            />
          </Field>
          <Field label="Ghana Card number" htmlFor="nationalId">
            <Input id="nationalId" name="nationalId" defaultValue={values?.nationalId} />
          </Field>
          <Field label="SSNIT number" htmlFor="ssnitNumber">
            <Input id="ssnitNumber" name="ssnitNumber" defaultValue={values?.ssnitNumber} />
          </Field>
          <Field label="TIN" htmlFor="tin">
            <Input id="tin" name="tin" defaultValue={values?.tin} />
          </Field>
        </CardBody>
      </Card>

      {!editing && documentCategories.length ? (
        <Card>
          <CardHeader
            title="Documents"
            description="Contract, certificates, Ghana Card: filed with the record as it is created."
          />
          <CardBody>
            <DocumentsField categories={documentCategories} />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Next of kin"
          description="Who the school calls if something happens at work."
        />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <Field label="Name" htmlFor="emergencyName">
            <Input id="emergencyName" name="emergencyName" defaultValue={values?.emergencyName} />
          </Field>
          <Field label="Phone" htmlFor="emergencyPhone">
            <Input id="emergencyPhone" name="emergencyPhone" defaultValue={values?.emergencyPhone} />
          </Field>
          <Field label="Relationship" htmlFor="emergencyRelation">
            <Input
              id="emergencyRelation"
              name="emergencyRelation"
              defaultValue={values?.emergencyRelation}
              placeholder="Spouse"
            />
          </Field>
          <div className="sm:col-span-3">
            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={3} defaultValue={values?.notes} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Submit editing={editing} />
    </form>
  );
}

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {editing ? <Save className="size-4" /> : <UserPlus className="size-4" />}
      {pending ? "Saving…" : editing ? "Save changes" : "Add staff member"}
    </Button>
  );
}
