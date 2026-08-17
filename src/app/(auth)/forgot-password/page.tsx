import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

/**
 * The page the login screen has linked to since the beginning — and which,
 * until now, did not exist. A parent who forgot their password met a 404 on
 * the one day they were already frustrated.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-sm">
        <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-text)]">
          <KeyRound className="size-5" />
        </span>
        <h1 className="text-lg font-semibold">Forgot your password?</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Enter the email or phone number you sign in with, and a reset link is sent
          there if an account exists.
        </p>

        <ForgotPasswordForm />

        <p className="mt-4 text-xs text-[var(--text-subtle)]">
          No message after a few minutes? The school office can reset it in person —
          the front desk issues a temporary password on the spot.
        </p>

        <Link
          href="/login"
          className="mt-3 inline-block text-xs text-[var(--primary)] hover:underline"
        >
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
