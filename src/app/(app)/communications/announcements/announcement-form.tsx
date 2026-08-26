"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Megaphone } from "lucide-react";

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
import { cn } from "@/lib/utils";

import { saveAnnouncementAction, type AnnouncementState } from "../actions";

const CATEGORIES = ["GENERAL", "EVENT", "ACADEMIC", "SPORTS", "EMERGENCY", "FEES"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

export function AnnouncementForm() {
  const [state, action] = useActionState<AnnouncementState, FormData>(
    saveAnnouncementAction,
    {},
  );
  const [audiences, setAudiences] = useState<string[]>(["STAFF", "STUDENT", "GUARDIAN"]);
  const [channels, setChannels] = useState<string[]>(["IN_APP"]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setAudiences(["STAFF", "STUDENT", "GUARDIAN"]);
      setChannels(["IN_APP"]);
    }
  }, [state.ok]);

  return (
    <form ref={formRef} action={action}>
      {audiences.map((value) => (
        <input key={value} type="hidden" name="audiences" value={value} />
      ))}
      {channels.map((value) => (
        <input key={value} type="hidden" name="channels" value={value} />
      ))}

      <CardBody className="space-y-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">Announcement saved.</Alert> : null}

        <Field label="Title" htmlFor="title" required>
          <Input id="title" name="title" required placeholder="Mid-term break dates" />
        </Field>

        <Field label="Summary" htmlFor="summary" hint="One line shown in the feed.">
          <Input id="summary" name="summary" placeholder="School closes Friday." />
        </Field>

        <Field label="Message" htmlFor="body" required>
          <Textarea id="body" name="body" rows={6} required />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" htmlFor="category">
            <SearchableSelect
              id="category"
              name="category"
              clearable={false}
              defaultValue="GENERAL"
              options={CATEGORIES.map((value) => ({
                value,
                label: value.charAt(0) + value.slice(1).toLowerCase(),
              }))}
            />
          </Field>
          <Field label="Priority" htmlFor="priority">
            <SearchableSelect
              id="priority"
              name="priority"
              clearable={false}
              defaultValue="NORMAL"
              options={PRIORITIES.map((value) => ({
                value,
                label: value.charAt(0) + value.slice(1).toLowerCase(),
              }))}
            />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
            Who sees it
          </legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "STAFF", label: "Staff" },
                { value: "STUDENT", label: "Students" },
                { value: "GUARDIAN", label: "Parents" },
              ] as const
            ).map((option) => (
              <Toggle
                key={option.value}
                label={option.label}
                active={audiences.includes(option.value)}
                onClick={() =>
                  setAudiences((current) =>
                    current.includes(option.value)
                      ? current.filter((entry) => entry !== option.value)
                      : [...current, option.value],
                  )
                }
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
            Also send as
          </legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "IN_APP", label: "In-app" },
                { value: "PUSH", label: "Push" },
                { value: "EMAIL", label: "Email" },
                { value: "SMS", label: "SMS (charged)" },
              ] as const
            ).map((option) => (
              <Toggle
                key={option.value}
                label={option.label}
                active={channels.includes(option.value)}
                onClick={() =>
                  setChannels((current) =>
                    current.includes(option.value)
                      ? current.filter((entry) => entry !== option.value)
                      : [...current, option.value],
                  )
                }
              />
            ))}
          </div>
        </fieldset>

        <CheckboxField
          name="isPinned"
          label="Pin to the top of the feed"
          description="Use sparingly: everything pinned means nothing is."
        />
        <CheckboxField
          name="publishNow"
          label="Publish immediately"
          description="Otherwise it is saved as a draft you can publish later."
          defaultChecked
        />

        <SubmitButton disabled={!audiences.length} />
      </CardBody>
    </form>
  );
}

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-[var(--primary)] text-[var(--primary-text)]"
          : "border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]",
      )}
    >
      {label}
    </button>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending || disabled}>
      <Megaphone className="size-4" />
      {pending ? "Saving…" : "Save announcement"}
    </Button>
  );
}
