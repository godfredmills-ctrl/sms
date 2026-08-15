"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Mail } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, CardBody } from "@/components/ui";

import { emailReportCardsAction, type EmailCardsState } from "./actions";

/**
 * Emails a class's published report cards home.
 *
 * The skipped list is shown in full rather than summarised into a count: "12
 * sent" hides the three families who got nothing, and those are the three the
 * office has to ring.
 */
export function EmailCardsPanel({
  termId,
  sections,
}: {
  termId: string;
  sections: SelectOption[];
}) {
  const [state, action] = useActionState<EmailCardsState, FormData>(
    emailReportCardsAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        <input type="hidden" name="termId" value={termId} />

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? (
          <Alert tone={state.skipped?.length ? "warning" : "success"}>
            <p>{state.message}</p>
            {state.skipped?.length ? (
              <>
                <p className="mt-1.5 text-xs font-medium">
                  {state.skipped.length} received nothing:
                </p>
                <ul className="mt-0.5 list-inside list-disc text-xs">
                  {state.skipped.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </Alert>
        ) : null}

        <label className="block text-xs font-medium text-[var(--text-muted)]">
          Class
        </label>
        <SearchableSelect
          name="classSectionId"
          required
          placeholder="Choose a class…"
          options={sections}
        />

        <SendButton />

        <p className="text-xs text-[var(--text-subtle)]">
          One email per family, carrying only their own child&rsquo;s report. Published
          cards only — a draft is not something to send home.
        </p>
      </CardBody>
    </form>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      <Mail className="size-4" />
      {pending ? "Sending…" : "Email report cards"}
    </Button>
  );
}
