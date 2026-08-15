import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";

export const metadata: Metadata = { title: "Page not found" };

/**
 * The App Router's own 404.
 *
 * Providing this explicitly also keeps the build off Next's internal
 * pages-router `/404` and `/_error` fallbacks, which are the pages that fail
 * to prerender when a stale build cache and a changed NODE_ENV disagree.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-subtle)]">
          <Compass className="size-7" />
        </span>
        <p className="numeric text-sm font-medium text-[var(--text-subtle)]">404</p>
        <h1 className="mt-1 text-xl font-semibold">We can&apos;t find that page</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The link may be out of date, or the record may have been removed.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/"
            className="inline-flex h-9.5 items-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-text)]"
          >
            Back to my dashboard
          </Link>
          <Link
            href="/login"
            className="inline-flex h-9.5 items-center rounded-lg border border-[var(--border-strong)] px-4 text-sm font-medium"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
