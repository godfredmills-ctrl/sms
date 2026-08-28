"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { CheckCircle2, HeartHandshake, Loader2, Plus, UserPlus } from "lucide-react";

import { Modal } from "@/components/modal";
import { SearchableSelect } from "@/components/select-search";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { ENGAGEMENTS, carriesMoney, graduationYearFor } from "@/lib/alumni-rules";

import {
  bringLeaversForwardAction,
  recordEngagementAction,
  saveAlumnusAction,
  verifyContactAction,
  type AlumniState,
} from "./actions";

function Submit({ label, variant }: { label: string; variant?: "primary" | "outline" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} className="w-full" disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {pending ? "Saving…" : label}
    </Button>
  );
}

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

// ---------------------------------------------------------------------------

export type AlumnusValues = {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  otherNames: string;
  nameAtSchool: string;
  gender: string;
  graduationYear: string;
  finalClass: string;
  completed: boolean;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  city: string;
  country: string;
  university: string;
  course: string;
  occupation: string;
  employer: string;
  jobTitle: string;
  linkedinUrl: string;
  achievements: string;
  consentToContact: boolean;
  consentSource: string;
  deceasedOn: string;
  notes: string;
};

export function AlumnusButton({ values, label }: { values?: AlumnusValues; label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant={values ? "outline" : "primary"} onClick={() => setOpen(true)}>
        {values ? null : <Plus className="size-4" />}
        {label ?? (values ? "Edit" : "Add somebody")}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={values ? `Edit ${values.firstName} ${values.lastName}` : "Add to the register"}
        description={
          values
            ? undefined
            : "For somebody who left before the school had a system, or whose record was never linked."
        }
        wide
      >
        <AlumnusForm values={values} onSaved={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function AlumnusForm({ values, onSaved }: { values?: AlumnusValues; onSaved: () => void }) {
  const [state, action] = useActionState<AlumniState, FormData>(saveAlumnusAction, {});
  const [consent, setConsent] = useState(values?.consentToContact ?? false);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      onSaved();
    }
  }, [state.ok, router, onSaved]);

  return (
    <form action={action} className="space-y-5">
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <section className="space-y-3">
        <p className="text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
          Who
        </p>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" defaultValue={values?.title} placeholder="Dr" />
          </Field>
          <Field label="First name" htmlFor="firstName" required className="sm:col-span-1">
            <Input id="firstName" name="firstName" required defaultValue={values?.firstName} />
          </Field>
          <Field label="Other names" htmlFor="otherNames">
            <Input id="otherNames" name="otherNames" defaultValue={values?.otherNames} />
          </Field>
          <Field label="Last name" htmlFor="lastName" required>
            <Input id="lastName" name="lastName" required defaultValue={values?.lastName} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Name at school"
            htmlFor="nameAtSchool"
            hint="If it differs. A register that cannot connect the two cannot find anybody in its own photographs."
          >
            <Input id="nameAtSchool" name="nameAtSchool" defaultValue={values?.nameAtSchool} />
          </Field>
          <Field label="Gender" htmlFor="gender">
            <SearchableSelect
              id="gender"
              name="gender"
              defaultValue={values?.gender ?? "UNDISCLOSED"}
              clearable={false}
              options={[
                { value: "FEMALE", label: "Female" },
                { value: "MALE", label: "Male" },
                { value: "OTHER", label: "Other" },
                { value: "UNDISCLOSED", label: "Prefer not to say" },
              ]}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Year they left" htmlFor="graduationYear" required>
            <Input
              id="graduationYear"
              name="graduationYear"
              type="number"
              min="1900"
              max="2200"
              required
              defaultValue={values?.graduationYear ?? String(graduationYearFor(new Date()))}
            />
          </Field>
          <Field label="Final class" htmlFor="finalClass">
            <Input id="finalClass" name="finalClass" defaultValue={values?.finalClass} placeholder="JHS 3 B" />
          </Field>
          <Field label="Deceased" htmlFor="deceasedOn" hint="Leave empty unless it applies.">
            <Input id="deceasedOn" name="deceasedOn" type="date" defaultValue={values?.deceasedOn} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="completed"
            defaultChecked={values ? values.completed : true}
            className="accent-[var(--primary)]"
          />
          Completed the course and left with a certificate
        </label>
      </section>

      <section className="space-y-3 border-t border-[var(--border)] pt-4">
        <p className="text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
          How to reach them
        </p>
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          Their own details, not the school&rsquo;s. A school email is switched off
          at graduation and a parent&rsquo;s phone stops being the way to reach a
          thirty-year-old.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={values?.email} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={values?.phone} />
          </Field>
          <Field label="WhatsApp" htmlFor="whatsapp">
            <Input id="whatsapp" name="whatsapp" defaultValue={values?.whatsapp} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Address" htmlFor="address" className="sm:col-span-1">
            <Input id="address" name="address" defaultValue={values?.address} />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" name="city" defaultValue={values?.city} />
          </Field>
          <Field label="Country" htmlFor="country">
            <Input id="country" name="country" defaultValue={values?.country ?? "Ghana"} />
          </Field>
        </div>

        <div className="rounded-xl border border-[var(--border)] p-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="consentToContact"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 accent-[var(--primary)]"
            />
            <span>
              <span className="font-medium">They have agreed to be contacted.</span>
              <span className="block text-[var(--text-muted)]">
                Under the Data Protection Act 2012 the school has to be able to say
                when and how somebody agreed, not merely that a box is ticked.
                Leaving school is not agreement.
              </span>
            </span>
          </label>

          {consent ? (
            <div className="mt-3">
              <Field
                label="How they agreed"
                htmlFor="consentSource"
                required
                hint="Where the agreement is recorded, so it can be produced if asked."
              >
                <Input
                  id="consentSource"
                  name="consentSource"
                  required
                  defaultValue={values?.consentSource}
                  placeholder="Signed the leavers form, June 2026"
                />
              </Field>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3 border-t border-[var(--border)] pt-4">
        <p className="text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
          Where they went
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="University" htmlFor="university">
            <Input id="university" name="university" defaultValue={values?.university} />
          </Field>
          <Field label="Course" htmlFor="course">
            <Input id="course" name="course" defaultValue={values?.course} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Occupation" htmlFor="occupation">
            <Input id="occupation" name="occupation" defaultValue={values?.occupation} />
          </Field>
          <Field label="Employer" htmlFor="employer">
            <Input id="employer" name="employer" defaultValue={values?.employer} />
          </Field>
          <Field label="Job title" htmlFor="jobTitle">
            <Input id="jobTitle" name="jobTitle" defaultValue={values?.jobTitle} />
          </Field>
        </div>

        <Field label="LinkedIn" htmlFor="linkedinUrl">
          <Input id="linkedinUrl" name="linkedinUrl" defaultValue={values?.linkedinUrl} />
        </Field>

        <Field label="Anything worth recording" htmlFor="achievements">
          <Textarea id="achievements" name="achievements" rows={2} defaultValue={values?.achievements} />
        </Field>

        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={2} defaultValue={values?.notes} />
        </Field>
      </section>

      <Submit label={values?.id ? "Save changes" : "Add to the register"} />
    </form>
  );
}

// ---------------------------------------------------------------------------

export function BringForwardButton({ waiting }: { waiting: number }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<AlumniState, FormData>(
    bringLeaversForwardAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={waiting === 0}>
        <UserPlus className="size-4" />
        Bring leavers forward
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Bring leavers forward">
        <form action={action} className="space-y-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

          <div className="rounded-lg bg-[var(--bg-subtle)] p-3 text-sm leading-relaxed">
            <p className="font-medium">
              {waiting} {waiting === 1 ? "graduate" : "graduates"} not on the register.
            </p>
            <p className="mt-1 text-[var(--text-muted)]">
              Graduates only. Somebody who transferred out in Primary 4 because
              the family moved to Kumasi is not an old boy of this school, and
              adding them turns a list of people with a connection into a list
              of everybody who ever passed through. Add those by hand if you
              disagree.
            </p>
            <p className="mt-2 text-[var(--text-muted)]">
              Nobody is marked as having agreed to be contacted, and nothing is
              marked confirmed. The school email on each was switched off the
              day they left.
            </p>
          </div>

          <Field
            label="File them under"
            htmlFor="graduationYear"
            hint="The cohort. A Ghanaian school year runs September to July, so this defaults to the year the current one ends."
          >
            <Input
              id="graduationYear"
              name="graduationYear"
              type="number"
              min="1900"
              max="2200"
              defaultValue={String(graduationYearFor(new Date()))}
            />
          </Field>

          <Submit label="Bring them forward" />
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------

export function VerifyButton({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState<AlumniState, FormData>(verifyContactAction, {});
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <VerifySubmit name={name} />
    </form>
  );
}

function VerifySubmit({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant="outline"
      disabled={pending}
      title={`Record that ${name}'s details were checked today`}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <CheckCircle2 className="size-3.5" />
      )}
      Details are current
    </Button>
  );
}

// ---------------------------------------------------------------------------

export function EngagementButton({ alumnusId, name }: { alumnusId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("DONATION");
  const [state, action] = useActionState<AlumniState, FormData>(
    recordEngagementAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      setOpen(false);
    }
  }, [state.ok, router]);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <HeartHandshake className="size-4" />
        Record something
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`${name}: record something`}>
        <form action={action} className="space-y-4">
          <input type="hidden" name="alumnusId" value={alumnusId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="What" htmlFor="kind" required>
              <SearchableSelect
                id="kind"
                name="kind"
                clearable={false}
                value={kind}
                onChange={(value) => setKind(String(value))}
                options={ENGAGEMENTS.map((entry) => ({
                  value: entry.value,
                  label: entry.label,
                }))}
              />
            </Field>
            <Field label="When" htmlFor="happenedOn">
              <Input id="happenedOn" name="happenedOn" type="date" defaultValue={today()} />
            </Field>
          </div>

          <Field label="In a line" htmlFor="summary" required>
            <Input
              id="summary"
              name="summary"
              required
              placeholder="Spoke to the JHS 3 leavers about engineering"
            />
          </Field>

          {carriesMoney(kind) ? (
            <Field
              label="Amount"
              htmlFor="amount"
              hint="In cedis. Only a donation carries an amount, so the totals stay honest."
            >
              <Input id="amount" name="amount" type="number" step="0.01" min="0" />
            </Field>
          ) : null}

          <Field label="Anything more" htmlFor="detail">
            <Textarea id="detail" name="detail" rows={2} />
          </Field>

          <Submit label="Record it" />
        </form>
      </Modal>
    </>
  );
}
