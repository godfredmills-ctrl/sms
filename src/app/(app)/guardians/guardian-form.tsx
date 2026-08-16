"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save, UserPlus } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
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
import { MESSAGE_CHANNELS } from "@/lib/audiences";

import { createGuardianAction, updateGuardianAction, type GuardianState } from "./actions";

const GENDERS = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
  { value: "OTHER", label: "Other" },
  { value: "UNDISCLOSED", label: "Prefer not to say" },
];

export type GuardianValues = {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  otherNames: string;
  gender: string;
  email: string;
  phone: string;
  altPhone: string;
  whatsapp: string;
  address: string;
  digitalAddr: string;
  city: string;
  nationality: string;
  nationalId: string;
  occupation: string;
  employer: string;
  jobTitle: string;
  workPhone: string;
  religion: string;
  preferredChannel: string;
  notes: string;
};

export function GuardianForm({ values }: { values?: GuardianValues }) {
  const editing = Boolean(values?.id);
  const [state, action] = useActionState<GuardianState, FormData>(
    editing ? updateGuardianAction : createGuardianAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message ?? "Added."}</Alert> : null}

      <Card>
        <CardHeader title="Identity" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" defaultValue={values?.title} placeholder="Mr" />
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
          <Field label="Ghana Card number" htmlFor="nationalId">
            <Input id="nationalId" name="nationalId" defaultValue={values?.nationalId} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Contact"
          description="The phone number is how the school reaches this family, and how the system knows one parent from another."
        />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone" htmlFor="phone" required>
            <Input id="phone" name="phone" required defaultValue={values?.phone} placeholder="024 123 4567" />
          </Field>
          <Field label="WhatsApp" htmlFor="whatsapp" hint="If different from the phone.">
            <Input id="whatsapp" name="whatsapp" defaultValue={values?.whatsapp} />
          </Field>
          <Field label="Alternative phone" htmlFor="altPhone">
            <Input id="altPhone" name="altPhone" defaultValue={values?.altPhone} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={values?.email} />
          </Field>
          <Field label="Residential address" htmlFor="address">
            <Input id="address" name="address" defaultValue={values?.address} />
          </Field>
          <Field label="Digital address" htmlFor="digitalAddr">
            <Input id="digitalAddr" name="digitalAddr" defaultValue={values?.digitalAddr} placeholder="GA-123-4567" />
          </Field>
          <Field label="City / town" htmlFor="city">
            <Input id="city" name="city" defaultValue={values?.city} />
          </Field>
          <Field label="Preferred channel" htmlFor="preferredChannel">
            <SearchableSelect
              id="preferredChannel"
              name="preferredChannel"
              clearable={false}
              defaultValue={values?.preferredChannel ?? "SMS"}
              options={MESSAGE_CHANNELS}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Work and background" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Occupation" htmlFor="occupation">
            <Input id="occupation" name="occupation" defaultValue={values?.occupation} />
          </Field>
          <Field label="Employer" htmlFor="employer">
            <Input id="employer" name="employer" defaultValue={values?.employer} />
          </Field>
          <Field label="Job title" htmlFor="jobTitle">
            <Input id="jobTitle" name="jobTitle" defaultValue={values?.jobTitle} />
          </Field>
          <Field label="Work phone" htmlFor="workPhone">
            <Input id="workPhone" name="workPhone" defaultValue={values?.workPhone} />
          </Field>
          <Field label="Nationality" htmlFor="nationality">
            <Input id="nationality" name="nationality" defaultValue={values?.nationality ?? "Ghanaian"} />
          </Field>
          <Field label="Religion" htmlFor="religion">
            <Input id="religion" name="religion" defaultValue={values?.religion} />
          </Field>
          <div className="sm:col-span-2">
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
      {pending ? "Saving…" : editing ? "Save changes" : "Add guardian"}
    </Button>
  );
}
