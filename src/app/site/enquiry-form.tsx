"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { submitEnquiryAction, type EnquiryState } from "./enquiry-action";

/**
 * The admission enquiry form on the public website.
 *
 * Styled inline rather than with the app's UI kit: this renders on the
 * school's public site, whose look comes from the site theme, and pulling the
 * admin components in here would drag their design (and their bundle) onto a
 * page for visitors.
 *
 * Two spam defences, neither of which depends on a third-party service,
 * because a school should not need a CAPTCHA account for its own admission
 * form. A honeypot field invisible to people but filled in by bots, and a
 * timestamp: a form submitted four seconds after the page loaded was not
 * filled in by a parent thinking about their child's education.
 */
export function EnquiryForm({
  levels,
  thanks,
  accent,
}: {
  levels: string[];
  thanks: string;
  accent: string;
}) {
  const [state, action] = useActionState<EnquiryState, FormData>(
    submitEnquiryAction,
    {},
  );
  const [loadedAt] = useState(() => Date.now());
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  if (state.ok) {
    return (
      <div
        className="rounded-xl border p-6 text-center"
        style={{ borderColor: accent, background: `${accent}0d` }}
      >
        <p className="text-lg font-semibold" style={{ color: accent }}>
          ✓
        </p>
        <p className="mt-1 text-sm">{thanks}</p>
      </div>
    );
  }

  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500";
  const label = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="loadedAt" value={loadedAt} />
      {/* The honeypot. Hidden from people, irresistible to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Leave this empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="enq-child">
            Child&apos;s full name *
          </label>
          <input id="enq-child" name="childName" required className={input} />
        </div>
        <div>
          <label className={label} htmlFor="enq-dob">
            Child&apos;s date of birth
          </label>
          <input id="enq-dob" name="childDateOfBirth" type="date" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="enq-level">
            Level applying for *
          </label>
          <select id="enq-level" name="level" required className={input}>
            <option value="">Choose…</option>
            {levels.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="enq-start">
            When would they start?
          </label>
          <select id="enq-start" name="intake" className={input}>
            <option value="">Choose…</option>
            <option>This term</option>
            <option>Next term</option>
            <option>Next academic year</option>
            <option>Just enquiring</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="enq-parent">
            Parent / guardian name *
          </label>
          <input id="enq-parent" name="parentName" required className={input} />
        </div>
        <div>
          <label className={label} htmlFor="enq-phone">
            Phone *
          </label>
          <input
            id="enq-phone"
            name="phone"
            type="tel"
            required
            className={input}
            placeholder="024 123 4567"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="enq-email">
            Email
          </label>
          <input id="enq-email" name="email" type="email" className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="enq-message">
            Anything we should know?
          </label>
          <textarea
            id="enq-message"
            name="message"
            rows={4}
            className={input}
            placeholder="Current school, siblings here, questions about fees or boarding…"
          />
        </div>
      </div>

      <SubmitButton accent={accent} />
      <p className="text-xs text-slate-500">
        The school uses these details only to respond to this enquiry.
      </p>
    </form>
  );
}

function SubmitButton({ accent }: { accent: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60 sm:w-auto sm:px-8"
      style={{ background: accent }}
    >
      {pending ? "Sending…" : "Send enquiry"}
    </button>
  );
}
