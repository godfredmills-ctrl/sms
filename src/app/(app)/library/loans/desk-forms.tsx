"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { BookUp, RotateCcw, Undo2 } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, CardBody, Field, Input, Select } from "@/components/ui";
import { CONDITIONS } from "@/lib/library";

import {
  issueLoanAction,
  renewLoanAction,
  returnLoanAction,
  type LibraryState,
} from "../actions";

/**
 * Issuing a book.
 *
 * The accession number comes first and keeps the cursor, because the desk's
 * rhythm is book-then-child and a queue of eleven-year-olds does not wait for
 * a mouse. After a successful issue the field clears and refocuses itself so
 * the next book can be typed straight away.
 */
export function IssueForm({
  students,
  staff,
}: {
  students: SelectOption[];
  staff: SelectOption[];
}) {
  const [state, action] = useActionState<LibraryState, FormData>(issueLoanAction, {});
  const [borrowerKind, setBorrowerKind] = useState<"STUDENT" | "STAFF">("STUDENT");
  const accession = useRef<HTMLInputElement>(null);

  // Remount clears the searchable select, which holds its choice internally.
  const [formKey, setFormKey] = useState(0);
  const lastHandled = useRef<LibraryState | null>(null);
  useEffect(() => {
    if (state.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      setFormKey((key) => key + 1);
    }
  }, [state]);

  // After the remount the node is new, so focus is taken here rather than in
  // the effect above — which would be pointing at the element just discarded.
  // Guarded on formKey so it does not also fire on mount, where autoFocus has
  // it covered — see the note on the same effect in ReturnForm.
  useEffect(() => {
    if (formKey > 0) accession.current?.focus();
  }, [formKey]);

  return (
    <form key={formKey} action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field
          label="Accession number"
          htmlFor="issue-accession"
          required
          hint="The number written inside the cover."
        >
          <Input
            ref={accession}
            id="issue-accession"
            name="accessionNo"
            required
            autoComplete="off"
            autoFocus
            className="font-mono uppercase"
            placeholder="GCS-004821"
          />
        </Field>

        <div className="flex gap-1.5">
          {(["STUDENT", "STAFF"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setBorrowerKind(kind)}
              className={
                borrowerKind === kind
                  ? "rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full px-3 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
              }
            >
              {kind === "STUDENT" ? "A pupil" : "A member of staff"}
            </button>
          ))}
        </div>

        {/*
          Only the chosen borrower's field is rendered — and `key` is what
          makes that true.
          
          Without it React reconciles the two branches as one component,
          because they sit at the same position and are the same type: only
          the props change. SearchableSelect keeps its choice in its own
          state, so that state survived the switch. The staff select then
          showed its placeholder — its options no longer contain a pupil's
          id — while still posting a hidden staffId holding that pupil's id.
          The desk answered "That borrower was not found", the field looked
          empty, and clicking Issue again did the same thing forever.
        */}
        {borrowerKind === "STUDENT" ? (
          <Field label="Pupil" htmlFor="issue-student" required>
            <SearchableSelect
              key="borrower-student"
              id="issue-student"
              name="studentId"
              required
              options={students}
              placeholder="Search by name or admission number…"
              searchPlaceholder="Name or admission number…"
            />
          </Field>
        ) : (
          <Field label="Member of staff" htmlFor="issue-staff" required>
            <SearchableSelect
              key="borrower-staff"
              id="issue-staff"
              name="staffId"
              required
              options={staff}
              placeholder="Search by name…"
              searchPlaceholder="Name or department…"
            />
          </Field>
        )}

        <Submit icon={<BookUp className="size-4" />} label="Issue" busy="Issuing…" />
      </CardBody>
    </form>
  );
}

/** Taking a book back. One field, because that is all the desk has. */
export function ReturnForm() {
  const [state, action] = useActionState<LibraryState, FormData>(returnLoanAction, {});
  const [showCondition, setShowCondition] = useState(false);
  const accession = useRef<HTMLInputElement>(null);

  const [formKey, setFormKey] = useState(0);
  const lastHandled = useRef<LibraryState | null>(null);
  useEffect(() => {
    if (state.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      setFormKey((key) => key + 1);
      setShowCondition(false);
    }
  }, [state]);

  // formKey > 0 means "after a successful return", which is when the desk
  // wants the cursor back here. On mount it must not fire: this form renders
  // after the issue form, so its focus call landed last and took the cursor
  // off the Issue box on every page load. A librarian typing an accession
  // number and pressing Enter was then closing someone else's loan instead of
  // issuing a book — a single-input form submits on Enter, and the message
  // that came back looked like an ordinary success.
  useEffect(() => {
    if (formKey > 0) accession.current?.focus();
  }, [formKey]);

  return (
    <form key={formKey} action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Accession number" htmlFor="return-accession" required>
          <Input
            ref={accession}
            id="return-accession"
            name="accessionNo"
            required
            autoComplete="off"
            className="font-mono uppercase"
            placeholder="GCS-004821"
          />
        </Field>

        {showCondition ? (
          <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
            <Field
              label="Came back"
              htmlFor="return-condition"
              hint="Poor sets it aside for repair rather than back on the shelf."
            >
              <Select id="return-condition" name="returnCondition" defaultValue="">
                <option value="">As it went out</option>
                {CONDITIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Charge"
              htmlFor="return-fine"
              hint="Leave empty unless the school actually charges."
            >
              <Input id="return-fine" name="fine" inputMode="decimal" placeholder="0.00" />
            </Field>
            <Field label="Note" htmlFor="return-notes">
              <Input id="return-notes" name="notes" />
            </Field>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCondition(true)}
            className="text-xs font-medium text-[var(--primary)]"
          >
            Damaged, or a charge to record?
          </button>
        )}

        <Submit
          icon={<Undo2 className="size-4" />}
          label="Take back"
          busy="Taking back…"
          variant="secondary"
        />
      </CardBody>
    </form>
  );
}

/** Extends one loan from its row in the list. */
export function RenewButton({ loanId }: { loanId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const data = new FormData();
          data.append("loanId", loanId);
          const result = await renewLoanAction(data);
          setError(result.error ?? null);
          setPending(false);
        }}
      >
        <RotateCcw className="size-3.5" />
        {pending ? "Renewing…" : "Renew"}
      </Button>
      {error ? (
        <span className="max-w-48 text-right text-xs text-[var(--danger)]">{error}</span>
      ) : null}
    </div>
  );
}

function Submit({
  icon,
  label,
  busy,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  busy: string;
  variant?: "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} className="w-full">
      {icon}
      {pending ? busy : label}
    </Button>
  );
}
