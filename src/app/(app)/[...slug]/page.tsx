import Link from "next/link";
import { Compass } from "lucide-react";

import { Card, CardBody, LinkButton, PageHeader } from "@/components/ui";
import { landingPath, requireUser } from "@/lib/auth";
import { humanise } from "@/lib/utils";

/**
 * Catch-all inside the signed-in shell.
 *
 * Next.js prefers a concrete route over this one, so anything landing here is
 * a genuine wrong turn — a stale bookmark, a mistyped path, or a link to a
 * record that has since been deleted. It renders inside the shell rather than
 * as a bare 404 so the user keeps their navigation and can carry on.
 */

const SUGGESTIONS = [
  { href: "/students", label: "Students" },
  { href: "/finance", label: "Fees & billing" },
  { href: "/gradebook", label: "Gradebook" },
  { href: "/attendance", label: "Attendance" },
  { href: "/communications/announcements", label: "Announcements" },
  { href: "/reports", label: "Reports" },
];

export default async function NotFoundInAppPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const path = `/${slug.join("/")}`;

  return (
    <>
      <PageHeader
        title="That page does not exist"
        description={`Nothing is served at ${path}.`}
        breadcrumb={slug.map(humanise).join(" / ")}
      />

      <Card>
        <CardBody className="flex flex-col items-center py-14 text-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-subtle)]">
            <Compass className="size-6" />
          </span>
          <h2 className="text-base font-semibold">Let&rsquo;s get you back</h2>
          <p className="mt-2 max-w-md text-sm text-[var(--text-muted)]">
            The address may be out of date, or the record it pointed at may have been
            removed. Nothing has gone wrong with your account.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <LinkButton href={landingPath(user.portal)}>Back to dashboard</LinkButton>
            <Link
              href="/search"
              className="inline-flex h-9.5 items-center rounded-lg border border-[var(--border-strong)] px-4 text-sm font-medium hover:bg-[var(--bg-subtle)]"
            >
              Search instead
            </Link>
          </div>

          {user.portal === "STAFF" ? (
            <div className="mt-6 flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <Link
                  key={suggestion.href}
                  href={suggestion.href}
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                >
                  {suggestion.label}
                </Link>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>
    </>
  );
}
