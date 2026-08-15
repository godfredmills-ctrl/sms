import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { getCurrentUser, landingPath } from "@/lib/auth";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "Access denied" };

export default async function ForbiddenPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
          <ShieldAlert className="size-7" />
        </span>
        <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Your role doesn&apos;t include permission for this area. If you think this is a
          mistake, ask a system administrator to review your role.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <LinkButton href={user ? landingPath(user.portal) : "/login"}>
            Back to my dashboard
          </LinkButton>
          <Link
            href="/messages"
            className="inline-flex h-9.5 items-center rounded-lg border border-[var(--border-strong)] px-4 text-sm font-medium"
          >
            Contact admin
          </Link>
        </div>
      </div>
    </div>
  );
}
