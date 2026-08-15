import type { Metadata } from "next";
import { CloudOff } from "lucide-react";

export const metadata: Metadata = { title: "Offline" };

/** Served by the service worker when a navigation fails with no connection. */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-subtle)]">
          <CloudOff className="size-7" />
        </span>
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          This page needs a connection. Pages you have already opened are still
          available — reconnect to load anything new.
        </p>
      </div>
    </div>
  );
}
