import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, ShieldX } from "lucide-react";

import { resetTokenOwner } from "../../reset-actions";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const owner = await resetTokenOwner(token);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-sm">
        {owner ? (
          <>
            <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-text)]">
              <ShieldCheck className="size-5" />
            </span>
            <h1 className="text-lg font-semibold">Choose a new password</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Hello {owner.firstName}. Pick something at least eight characters long.
              Every signed-in session ends when you save it.
            </p>
            <ResetPasswordForm token={token} />
          </>
        ) : (
          <>
            <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-[var(--danger-soft)] text-[var(--danger)]">
              <ShieldX className="size-5" />
            </span>
            <h1 className="text-lg font-semibold">This link has expired</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Reset links work once and die after an hour. Request a fresh one and
              use it straight away.
            </p>
            <Link
              href="/forgot-password"
              className="mt-4 inline-flex h-10 items-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-text)] hover:opacity-90"
            >
              Request a new link
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
