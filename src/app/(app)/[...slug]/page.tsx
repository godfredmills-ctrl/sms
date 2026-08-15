import Link from "next/link";
import { Construction } from "lucide-react";

import { LinkButton, PageHeader, Card, CardBody } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { landingPath } from "@/lib/auth";
import { humanise } from "@/lib/utils";

/**
 * Catch-all for modules whose data layer and navigation exist but whose screens
 * are still being built. Next.js prefers a concrete route over this one, so a
 * page only lands here while it genuinely has no implementation — better than
 * a bare 404 that gives the user nothing to act on.
 */

/** What each planned module will do, so the page is informative, not a dead end. */
const MODULE_NOTES: Record<string, { title: string; description: string }> = {
  academics: {
    title: "Classes & Subjects",
    description:
      "Manage class levels, sections, streams, the curriculum map and timetables.",
  },
  gradebook: {
    title: "Gradebook",
    description:
      "Create assessments, enter marks for a whole class, and publish results to portals.",
  },
  reports: {
    title: "Reports",
    description:
      "Terminal and semester report cards, the custom report builder, and AI-written analysis.",
  },
  credentials: {
    title: "Transcripts & Certificates",
    description:
      "Generate transcripts and certificates from uploaded templates or the in-app designer.",
  },
  lms: {
    title: "Virtual Learning Environment",
    description:
      "Courses, lessons, assignments, quizzes and discussions for each subject.",
  },
  communications: {
    title: "Communications",
    description:
      "Announcements, bulk email and SMS, memos with acknowledgement tracking, and delivery logs.",
  },
  documents: {
    title: "Document Cabinet",
    description:
      "Folders, versioning, access control and in-browser previews for school documents.",
  },
  elections: {
    title: "Elections",
    description:
      "SRC, class representative and staff elections with secret ballots and live results.",
  },
  website: {
    title: "Website Builder",
    description:
      "Build and publish the school's public website, with page blocks and image editing.",
  },
  settings: {
    title: "Settings",
    description:
      "School profile, customisable dropdown options, custom fields, grading scales and integrations.",
  },
  users: {
    title: "Users & Roles",
    description: "Invite staff, assign roles and fine-tune permissions.",
  },
  audit: {
    title: "Audit Trail",
    description: "Every change to a record, who made it and when.",
  },
  staff: {
    title: "Staff",
    description: "Staff records, employment details, qualifications and leave.",
  },
  guardians: {
    title: "Guardians",
    description: "Parent and guardian records across the school.",
  },
  messages: {
    title: "Messages",
    description: "Threaded conversations between staff, guardians and students.",
  },
  analytics: {
    title: "Analytics",
    description:
      "School-wide performance analysis, at-risk scans and AI-generated insights.",
  },
  notifications: {
    title: "Notifications",
    description: "Everything the system has sent you, in one place.",
  },
  account: {
    title: "My Account",
    description: "Your profile, password and notification preferences.",
  },
  search: {
    title: "Search",
    description: "Search across students, staff, invoices and documents.",
  },
};

export default async function ModulePlaceholderPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const root = slug[0] ?? "";
  const note = MODULE_NOTES[root];

  return (
    <>
      <PageHeader
        title={note?.title ?? humanise(root)}
        description={note?.description}
        breadcrumb={slug.map(humanise).join(" / ")}
      />

      <Card>
        <CardBody className="flex flex-col items-center py-14 text-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--warning-soft)] text-[var(--warning)]">
            <Construction className="size-6" />
          </span>
          <h2 className="text-base font-semibold">This screen is still being built</h2>
          <p className="mt-2 max-w-md text-sm text-[var(--text-muted)]">
            The data model, permissions and business logic for this module are in
            place — the interface is next. Nothing you do elsewhere in the system is
            affected.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <LinkButton href={landingPath(user.portal)}>Back to dashboard</LinkButton>
            <Link
              href="/students"
              className="inline-flex h-9.5 items-center rounded-lg border border-[var(--border-strong)] px-4 text-sm font-medium"
            >
              Go to students
            </Link>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
