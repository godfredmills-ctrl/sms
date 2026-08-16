"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save } from "lucide-react";

import { ImageField } from "@/components/image-field";
import { SearchableSelect } from "@/components/select-search";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
} from "@/components/ui";

import { updateSchoolAction, type FormState } from "../actions";

export type SchoolValues = {
  id: string;
  name: string;
  shortName: string;
  motto: string;
  email: string;
  phone: string;
  altPhone: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  digitalAddr: string;
  postalBox: string;
  registrationNo: string;
  logoUrl: string;
  crestUrl: string;
  curricula: string[];
  brandPrimary: string;
  brandAccent: string;
  reportHeader: string;
};

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
];

const CURRICULA = [
  { value: "GES", label: "GES (Ghanaian national curriculum)" },
  { value: "British", label: "British / National Curriculum for England" },
  { value: "IGCSE", label: "Cambridge IGCSE" },
  { value: "IB", label: "International Baccalaureate" },
  { value: "AP", label: "Advanced Placement" },
  { value: "American", label: "American (Common Core)" },
  { value: "Montessori", label: "Montessori" },
];

export function SchoolForm({ values }: { values: SchoolValues }) {
  const [state, action] = useActionState<FormState, FormData>(updateSchoolAction, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={values.id} />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <Card>
        <CardHeader
          title="Identity"
          description="Appears on report cards, invoices, transcripts and the school website."
        />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="School name" htmlFor="name" required className="sm:col-span-2">
            <Input id="name" name="name" defaultValue={values.name} required />
          </Field>
          <Field label="Short name" htmlFor="shortName" hint="Used where space is tight">
            <Input id="shortName" name="shortName" defaultValue={values.shortName} />
          </Field>
          <Field label="Registration number" htmlFor="registrationNo">
            <Input
              id="registrationNo"
              name="registrationNo"
              defaultValue={values.registrationNo}
            />
          </Field>
          <Field label="Motto" htmlFor="motto" className="sm:col-span-2">
            <Input id="motto" name="motto" defaultValue={values.motto} />
          </Field>
          <Field label="Curricula offered" htmlFor="curricula" className="sm:col-span-2">
            <SearchableSelect
              id="curricula"
              name="curricula"
              multiple
              defaultValue={values.curricula}
              options={CURRICULA}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contact" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={values.email} />
          </Field>
          <Field label="Website" htmlFor="website">
            <Input id="website" name="website" defaultValue={values.website} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={values.phone} />
          </Field>
          <Field label="Alternate phone" htmlFor="altPhone">
            <Input id="altPhone" name="altPhone" defaultValue={values.altPhone} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Address" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Address line 1" htmlFor="addressLine1" className="sm:col-span-2">
            <Input
              id="addressLine1"
              name="addressLine1"
              defaultValue={values.addressLine1}
            />
          </Field>
          <Field label="Address line 2" htmlFor="addressLine2" className="sm:col-span-2">
            <Input
              id="addressLine2"
              name="addressLine2"
              defaultValue={values.addressLine2}
            />
          </Field>
          <Field label="City / town" htmlFor="city">
            <Input id="city" name="city" defaultValue={values.city} />
          </Field>
          <Field label="Region" htmlFor="region">
            <SearchableSelect
              id="region"
              name="region"
              defaultValue={values.region}
              options={REGIONS.map((region) => ({ value: region, label: region }))}
            />
          </Field>
          <Field
            label="Ghana Post GPS"
            htmlFor="digitalAddr"
            hint="e.g. GA-183-4567"
          >
            <Input id="digitalAddr" name="digitalAddr" defaultValue={values.digitalAddr} />
          </Field>
          <Field label="Postal box" htmlFor="postalBox">
            <Input id="postalBox" name="postalBox" defaultValue={values.postalBox} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Branding"
          description="Drives report card headers, certificates and the generated website."
        />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          {/* Certificates, transcripts and report cards embed these, and only
              ever from the school's own storage — the renderer will not fetch
              an outside URL. Uploading here produces an address it can read;
              the alternative was a school finding out on a printed document. */}
          <Field
            label="Logo"
            htmlFor="logoUrl"
            hint="Shown in the sidebar and on report cards. An image hosted elsewhere shows on screen but not on printed documents."
          >
            <ImageField id="logoUrl" name="logoUrl" defaultValue={values.logoUrl} />
          </Field>
          <Field label="Crest" htmlFor="crestUrl" hint="Used on certificates and transcripts.">
            <ImageField id="crestUrl" name="crestUrl" defaultValue={values.crestUrl} />
          </Field>
          <Field label="Primary colour" htmlFor="brandPrimary">
            <div className="flex gap-2">
              <Input
                id="brandPrimary"
                name="brandPrimary"
                defaultValue={values.brandPrimary}
                className="flex-1"
              />
              <input
                type="color"
                aria-label="Pick primary colour"
                defaultValue={values.brandPrimary}
                onChange={(event) => {
                  const field = document.getElementById(
                    "brandPrimary",
                  ) as HTMLInputElement | null;
                  if (field) field.value = event.target.value;
                }}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-1"
              />
            </div>
          </Field>
          <Field label="Accent colour" htmlFor="brandAccent">
            <div className="flex gap-2">
              <Input
                id="brandAccent"
                name="brandAccent"
                defaultValue={values.brandAccent}
                className="flex-1"
              />
              <input
                type="color"
                aria-label="Pick accent colour"
                defaultValue={values.brandAccent}
                onChange={(event) => {
                  const field = document.getElementById(
                    "brandAccent",
                  ) as HTMLInputElement | null;
                  if (field) field.value = event.target.value;
                }}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-1"
              />
            </div>
          </Field>
          <Field
            label="Report header"
            htmlFor="reportHeader"
            hint="The line printed across the top of report cards"
            className="sm:col-span-2"
          >
            <Input
              id="reportHeader"
              name="reportHeader"
              defaultValue={values.reportHeader}
            />
          </Field>
        </CardBody>
      </Card>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <div className="flex justify-end">
      <Button type="submit" disabled={pending}>
        <Save className="size-4" />
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
