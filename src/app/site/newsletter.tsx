"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";

import { subscribeNewsletterAction, type EnquiryState } from "./enquiry-action";

/** The footer's newsletter signup. Gold button, one field, no fuss. */
export function NewsletterForm({ gold, navy }: { gold: string; navy: string }) {
  const [state, action] = useActionState<EnquiryState, FormData>(
    subscribeNewsletterAction,
    {},
  );

  if (state.ok) {
    return <p className="text-xs text-white/75">Thank you: you are on the list.</p>;
  }

  return (
    <form action={action} className="flex gap-1.5">
      {/* Honeypot — see the enquiry form. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute -left-[9999px] h-0 w-0"
      />
      <input
        type="email"
        name="email"
        required
        placeholder="Enter your email"
        aria-label="Email address"
        className="h-9 min-w-0 flex-1 rounded-md border border-white/20 bg-white/10 px-3 text-xs text-white placeholder:text-white/70 focus:border-white/50 focus:outline-none"
      />
      <SubmitButton gold={gold} navy={navy} />
      {state.error ? <p className="text-xs text-red-300">{state.error}</p> : null}
    </form>
  );
}

function SubmitButton({ gold, navy }: { gold: string; navy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Subscribe"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md disabled:opacity-60"
      style={{ background: gold, color: navy }}
    >
      <ArrowRight className="size-4" />
    </button>
  );
}
