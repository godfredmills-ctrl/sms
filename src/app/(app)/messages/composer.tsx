"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { PenSquare, Send, X } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";

import { sendMessageAction, startConversationAction, type MessageState } from "./actions";

/** The reply box at the foot of an open thread. */
export function ReplyBox({ conversationId }: { conversationId: string }) {
  const [state, action] = useActionState<MessageState, FormData>(sendMessageAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      className="border-t border-[var(--border)] p-4"
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      {state.error ? (
        <Alert tone="danger" className="mb-2">
          {state.error}
        </Alert>
      ) : null}
      <div className="flex items-end gap-2">
        <Textarea
          name="body"
          rows={2}
          required
          placeholder="Write a reply…"
          aria-label="Reply"
          className="flex-1"
        />
        <SendButton />
      </div>
    </form>
  );
}

export function NewConversation({ people }: { people: SelectOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<MessageState, FormData>(
    startConversationAction,
    {},
  );

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <PenSquare className="size-4" />
        New message
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={() => setOpen(false)}
      />
      <div className="card relative z-10 w-full max-w-lg">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
          <p className="text-sm font-semibold">New message</p>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </Button>
        </div>

        <form action={action} className="space-y-3 p-5">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">Message sent.</Alert> : null}

          <Field label="To" htmlFor="recipientIds" required>
            <SearchableSelect
              id="recipientIds"
              name="recipientIds"
              multiple
              required
              options={people}
              placeholder="Search staff, parents and students…"
            />
          </Field>

          <Field label="Subject" htmlFor="subject" hint="Optional, but it helps later.">
            <Input id="subject" name="subject" />
          </Field>

          <Field label="Message" htmlFor="body" required>
            <Textarea id="body" name="body" rows={4} required />
          </Field>

          <SendButton label="Send message" full />
        </form>
      </div>
    </div>
  );
}

function SendButton({ label, full }: { label?: string; full?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={full ? "w-full" : undefined}>
      <Send className="size-4" />
      {pending ? "Sending…" : (label ?? "Send")}
    </Button>
  );
}
