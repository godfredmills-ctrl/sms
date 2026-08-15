"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Eye, EyeOff, LogIn } from "lucide-react";

import { Alert, Button, Field, Input } from "@/components/ui";

import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <Alert tone="danger">
          <span className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {state.error}
          </span>
        </Alert>
      ) : null}

      <Field
        label="Email, username or phone"
        htmlFor="identifier"
        hint="Parents can sign in with the phone number registered with the school."
      >
        <Input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
          placeholder="you@school.edu.gh or 024 123 4567"
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="pr-10"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-[var(--text-subtle)] hover:text-[var(--text)]"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      <div className="flex items-center justify-between text-xs">
        <label className="flex items-center gap-2 text-[var(--text-muted)]">
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="size-3.5 rounded accent-[var(--primary)]"
          />
          Keep me signed in
        </label>
        <a href="/forgot-password" className="text-[var(--primary)] hover:underline">
          Forgot password?
        </a>
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? (
        "Signing in…"
      ) : (
        <>
          <LogIn className="size-4" />
          Sign in
        </>
      )}
    </Button>
  );
}
