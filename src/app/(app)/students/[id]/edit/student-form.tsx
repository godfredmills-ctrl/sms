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
  CheckboxField,
  Field,
  Input,
  Textarea,
} from "@/components/ui";

import { updateStudentAction, type StudentState } from "../../actions";

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

const GENDERS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
  { value: "UNDISCLOSED", label: "Not stated" },
];

const LIVING_WITH = [
  { value: "BOTH_PARENTS", label: "Both parents" },
  { value: "MOTHER", label: "Mother" },
  { value: "FATHER", label: "Father" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "RELATIVE", label: "Relative" },
  { value: "BOARDING", label: "Boarding" },
];

const TRANSPORT = [
  { value: "SCHOOL_BUS", label: "School bus" },
  { value: "PRIVATE", label: "Private car" },
  { value: "WALKING", label: "Walking" },
  { value: "TROTRO", label: "Trotro" },
  { value: "TAXI", label: "Taxi" },
];

export type StudentFormValues = {
  id: string;
  admissionNo: string;
  indexNumber: string;
  firstName: string;
  lastName: string;
  otherNames: string;
  preferredName: string;
  gender: string;
  dateOfBirth: string;
  placeOfBirth: string;
  photoUrl: string;
  nationality: string;
  nationalId: string;
  birthCertNo: string;
  nhisNumber: string;
  religion: string;
  hometown: string;
  homeRegion: string;
  firstLanguage: string;
  email: string;
  phone: string;
  residentialAddress: string;
  digitalAddr: string;
  city: string;
  region: string;
  livingWith: string;
  transportMode: string;
  busRoute: string;
  isBoarder: boolean;
  house: string;
  dormitory: string;
  roomNumber: string;
  hasSpecialNeeds: boolean;
  specialNeedsNotes: string;
  learningSupport: string[];
  onScholarship: boolean;
  scholarshipDetails: string;
  notes: string;
};

/**
 * The student record, editable.
 *
 * Grouped the way a school office thinks about a child rather than the way
 * the table is laid out: who they are, where they come from, how to reach
 * them, how they get here and where they sleep, and what support they need.
 */
export function StudentForm({
  values,
  canSeeBackground,
}: {
  values: StudentFormValues;
  /** The family's circumstances: hidden, and unwritable, without the permission. */
  canSeeBackground: boolean;
}) {
  const [state, action] = useActionState<StudentState, FormData>(
    updateStudentAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={values.id} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <Card>
        <CardHeader
          title="Identity"
          description="The name and date of birth here are the ones printed on every certificate and sent for examination registration."
        />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" required>
            <Input id="firstName" name="firstName" defaultValue={values.firstName} required />
          </Field>
          <Field label="Last name" htmlFor="lastName" required>
            <Input id="lastName" name="lastName" defaultValue={values.lastName} required />
          </Field>
          <Field label="Other names" htmlFor="otherNames">
            <Input id="otherNames" name="otherNames" defaultValue={values.otherNames} />
          </Field>
          <Field label="Preferred name" htmlFor="preferredName">
            <Input id="preferredName" name="preferredName" defaultValue={values.preferredName} />
          </Field>
          <Field label="Admission number" htmlFor="admissionNo" required>
            <Input id="admissionNo" name="admissionNo" defaultValue={values.admissionNo} required />
          </Field>
          <Field
            label="Examination index number"
            htmlFor="indexNumber"
            hint="BECE or WASSCE. Appears on the transcript."
          >
            <Input id="indexNumber" name="indexNumber" defaultValue={values.indexNumber} />
          </Field>
          <Field label="Gender" htmlFor="gender">
            <SearchableSelect
              id="gender"
              name="gender"
              options={GENDERS}
              defaultValue={values.gender}
              clearable={false}
            />
          </Field>
          <Field label="Date of birth" htmlFor="dateOfBirth">
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              defaultValue={values.dateOfBirth}
            />
          </Field>
          <Field label="Place of birth" htmlFor="placeOfBirth">
            <Input id="placeOfBirth" name="placeOfBirth" defaultValue={values.placeOfBirth} />
          </Field>
          <Field label="Photograph" htmlFor="photoUrl">
            <ImageField
              id="photoUrl"
              name="photoUrl"
              defaultValue={values.photoUrl}
              visibility="private"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Background" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Nationality" htmlFor="nationality">
            <Input id="nationality" name="nationality" defaultValue={values.nationality} />
          </Field>
          <Field label="Ghana Card / passport" htmlFor="nationalId">
            <Input id="nationalId" name="nationalId" defaultValue={values.nationalId} />
          </Field>
          <Field label="Birth certificate no." htmlFor="birthCertNo">
            <Input id="birthCertNo" name="birthCertNo" defaultValue={values.birthCertNo} />
          </Field>
          <Field label="NHIS number" htmlFor="nhisNumber">
            <Input id="nhisNumber" name="nhisNumber" defaultValue={values.nhisNumber} />
          </Field>
          <Field label="Religion" htmlFor="religion">
            <Input id="religion" name="religion" defaultValue={values.religion} />
          </Field>
          <Field label="Hometown" htmlFor="hometown">
            <Input id="hometown" name="hometown" defaultValue={values.hometown} />
          </Field>
          <Field label="Home region" htmlFor="homeRegion">
            <SearchableSelect
              id="homeRegion"
              name="homeRegion"
              options={REGIONS}
              defaultValue={values.homeRegion}
            />
          </Field>
          <Field label="First language" htmlFor="firstLanguage">
            <Input id="firstLanguage" name="firstLanguage" defaultValue={values.firstLanguage} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contact" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={values.email} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={values.phone} />
          </Field>
          <Field label="Residential address" htmlFor="residentialAddress">
            <Input
              id="residentialAddress"
              name="residentialAddress"
              defaultValue={values.residentialAddress}
            />
          </Field>
          <Field label="Digital address (GPS)" htmlFor="digitalAddr">
            <Input id="digitalAddr" name="digitalAddr" defaultValue={values.digitalAddr} />
          </Field>
          <Field label="City / town" htmlFor="city">
            <Input id="city" name="city" defaultValue={values.city} />
          </Field>
          <Field label="Region" htmlFor="region">
            <SearchableSelect
              id="region"
              name="region"
              options={REGIONS}
              defaultValue={values.region}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Getting here, and where they sleep"
          description="The boarding register reads the house, dormitory and room set here."
        />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Transport" htmlFor="transportMode">
            <SearchableSelect
              id="transportMode"
              name="transportMode"
              options={TRANSPORT}
              defaultValue={values.transportMode}
            />
          </Field>
          <Field label="Bus route" htmlFor="busRoute">
            <Input id="busRoute" name="busRoute" defaultValue={values.busRoute} />
          </Field>
          <Field label="House" htmlFor="house">
            <Input id="house" name="house" defaultValue={values.house} placeholder="Ruby" />
          </Field>
          <div className="sm:col-span-2">
            <CheckboxField
              name="isBoarder"
              defaultChecked={values.isBoarder}
              label="Boarder"
              description="Sleeps at school. Appears on the boarding register."
            />
          </div>
          <Field label="Dormitory" htmlFor="dormitory">
            <Input id="dormitory" name="dormitory" defaultValue={values.dormitory} />
          </Field>
          <Field label="Room number" htmlFor="roomNumber">
            <Input id="roomNumber" name="roomNumber" defaultValue={values.roomNumber} />
          </Field>
        </CardBody>
      </Card>

      {canSeeBackground ? (
      <Card>
        <CardHeader title="Support and circumstances" />
        <CardBody className="space-y-3">
          <Field label="Living with" htmlFor="livingWith">
            <SearchableSelect
              id="livingWith"
              name="livingWith"
              options={LIVING_WITH}
              defaultValue={values.livingWith}
            />
          </Field>
          <CheckboxField
            name="hasSpecialNeeds"
            defaultChecked={values.hasSpecialNeeds}
            label="Has additional needs"
            description="Shown to teachers on the class list."
          />
          <Field label="Notes on additional needs" htmlFor="specialNeedsNotes">
            <Textarea
              id="specialNeedsNotes"
              name="specialNeedsNotes"
              rows={2}
              defaultValue={values.specialNeedsNotes}
            />
          </Field>
          <Field
            label="Learning support"
            htmlFor="learningSupport"
            hint="One per line: dyslexia, ADHD, speech therapy."
          >
            <Textarea
              id="learningSupport"
              name="learningSupport"
              rows={2}
              defaultValue={values.learningSupport.join("\n")}
            />
          </Field>
          <CheckboxField
            name="onScholarship"
            defaultChecked={values.onScholarship}
            label="On a scholarship or bursary"
          />
          <Field label="Scholarship details" htmlFor="scholarshipDetails">
            <Input
              id="scholarshipDetails"
              name="scholarshipDetails"
              defaultValue={values.scholarshipDetails}
            />
          </Field>
          <Field label="Office notes" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={3} defaultValue={values.notes} />
          </Field>
        </CardBody>
      </Card>
      ) : null}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Save className="size-4" />
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}
