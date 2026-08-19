import type { Metadata } from "next";
import Link from "next/link";
import { CheckCheck, Inbox, MailQuestion, ShieldAlert } from "lucide-react";
import { revalidatePath } from "next/cache";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { Pager, pageOf } from "@/components/pager";
import { RefreshButton } from "@/components/refresh-button";
import { authorize, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Enquiries" };
export const dynamic = "force-dynamic";

const PER_PAGE = 20;

/** The shape the public form writes. Everything optional except what it requires. */
type EnquiryData = {
  childName?: string;
  childDateOfBirth?: string | null;
  childGender?: string | null;
  level?: string;
  intake?: string | null;
  previousSchool?: string | null;
  parentName?: string;
  relationship?: string | null;
  phone?: string;
  email?: string | null;
  city?: string | null;
  heardFrom?: string | null;
  message?: string | null;
  note?: string;
};

async function markReadAction(formData: FormData) {
  "use server";
  await authorize("website.enquiry.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.siteFormSubmission.update({ where: { id }, data: { isRead: true } });
  revalidatePath("/website/enquiries");
}

async function toggleSpamAction(formData: FormData) {
  "use server";
  await authorize("website.enquiry.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const current = await db.siteFormSubmission.findUnique({
    where: { id },
    select: { isSpam: true },
  });
  if (!current) return;
  await db.siteFormSubmission.update({
    where: { id },
    data: { isSpam: !current.isSpam },
  });
  revalidatePath("/website/enquiries");
}

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Enquiries are pre-admissions work, so the admission permission governs
  // them — not the website permission, which is about editing pages.
  await requirePermission("website.enquiry.manage");

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);
  const showSpam = params.spam === "1";
  const showNewsletter = params.tab === "newsletter";

  const where = showNewsletter
    ? { formKey: "newsletter", isSpam: false }
    : { formKey: "admissions-enquiry", isSpam: showSpam };

  const [submissions, total, unread, spamCount] = await Promise.all([
    db.siteFormSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    db.siteFormSubmission.count({ where }),
    db.siteFormSubmission.count({
      where: { formKey: "admissions-enquiry", isSpam: false, isRead: false },
    }),
    db.siteFormSubmission.count({
      where: { formKey: "admissions-enquiry", isSpam: true },
    }),
  ]);

  // The whole list for the copy box, not just this page of it — the point of
  // a mailing list is pasting it into the send field of something.
  const allSubscribers = showNewsletter
    ? (
        await db.siteFormSubmission.findMany({
          where: { formKey: "newsletter", isSpam: false },
          orderBy: { createdAt: "desc" },
          select: { data: true },
          take: 5000,
        })
      )
        .map((row) => String((row.data as { email?: string })?.email ?? ""))
        .filter(Boolean)
    : [];

  return (
    <>
      <PageHeader
        title="Admission enquiries"
        description="Submitted from the public website. Convert the real ones with the admission form — an enquiry never becomes a student by itself."
        action={<RefreshButton />}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard
          label="Unread"
          value={unread}
          tone={unread ? "warning" : "success"}
          icon={<MailQuestion className="size-4" />}
        />
        <StatCard
          label={showSpam ? "In spam" : "Enquiries"}
          value={total}
          tone="violet"
          icon={<Inbox className="size-4" />}
        />
        <StatCard
          label="Flagged as spam"
          value={spamCount}
          tone="neutral"
          icon={<ShieldAlert className="size-4" />}
        />
      </div>

      <div className="mb-4 flex gap-1 border-b border-[var(--border)] pb-px">
        {[
          {
            label: "Enquiries",
            href: "/website/enquiries",
            active: !showSpam && !showNewsletter,
          },
          { label: "Spam", href: "/website/enquiries?spam=1", active: showSpam },
          {
            label: "Newsletter",
            href: "/website/enquiries?tab=newsletter",
            active: showNewsletter,
          },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            className={`border-b-2 px-3 py-2 text-sm transition-colors ${
              tab.active
                ? "border-[var(--primary)] font-medium text-[var(--primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {showNewsletter ? (
        <div className="space-y-3">
          {allSubscribers.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Inbox className="size-5" />}
                title="No subscribers yet"
                description="Addresses from the website footer's signup collect here."
              />
            </Card>
          ) : (
            <Card className="p-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {allSubscribers.length.toLocaleString()} subscriber
                  {allSubscribers.length === 1 ? "" : "s"}
                </p>
                <a
                  href="/website/enquiries/export"
                  className="text-xs font-medium text-[var(--primary)] hover:underline"
                >
                  Download CSV
                </a>
              </div>
              <p className="mb-2 text-xs text-[var(--text-subtle)]">
                One per line, newest first — select all and paste into your mail
                tool&rsquo;s BCC field.
              </p>
              <textarea
                readOnly
                rows={Math.min(allSubscribers.length + 1, 16)}
                value={allSubscribers.join("\n")}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 font-mono text-xs"
              />
            </Card>
          )}
        </div>
      ) : (
      <div className="space-y-3">
        {submissions.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Inbox className="size-5" />}
              title={showSpam ? "No spam" : "No enquiries yet"}
              description={
                showSpam
                  ? "Suspect submissions are kept here rather than dropped, in case one is a real family."
                  : "Enquiries from the website's admission form appear here."
              }
            />
          </Card>
        ) : (
          submissions.map((submission) => {
            const data = submission.data as EnquiryData;
            return (
              <Card
                key={submission.id}
                className={`p-5 ${submission.isRead ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold">
                        {data.childName ?? "Unnamed child"}
                      </h2>
                      {data.level ? <Badge tone="info">{data.level}</Badge> : null}
                      {data.intake ? <Badge tone="neutral">{data.intake}</Badge> : null}
                      {!submission.isRead ? <Badge tone="warning">New</Badge> : null}
                      {data.note === "rate-limited" ? (
                        <Badge tone="danger">Rate limited</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                      {relativeTime(submission.createdAt)}
                      {data.childDateOfBirth
                        ? ` · born ${formatDate(data.childDateOfBirth)}`
                        : ""}
                    </p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                  {[
                    {
                      label: "Parent / guardian",
                      value: [data.parentName, data.relationship]
                        .filter(Boolean)
                        .join(" · "),
                    },
                    { label: "Phone", value: data.phone, numeric: true },
                    { label: "Email", value: data.email },
                    { label: "Gender", value: data.childGender },
                    { label: "Previous school", value: data.previousSchool },
                    { label: "Area", value: data.city },
                    { label: "Heard about us", value: data.heardFrom },
                  ]
                    .filter((entry) => entry.value)
                    .map((entry) => (
                      <div key={entry.label}>
                        <dt className="text-[10px] tracking-wide text-[var(--text-subtle)] uppercase">
                          {entry.label}
                        </dt>
                        <dd
                          className={`truncate font-medium ${entry.numeric ? "numeric" : ""}`}
                        >
                          {entry.value}
                        </dd>
                      </div>
                    ))}
                </dl>

                {data.message ? (
                  <p className="mt-3 rounded-lg bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-muted)]">
                    {data.message}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                  <Link
                    href={`/students/new?from=${submission.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-xs font-medium text-[var(--primary-text)] hover:bg-[var(--primary-hover)]"
                  >
                    Start admission
                  </Link>

                  {!submission.isRead ? (
                    <form action={markReadAction}>
                      <input type="hidden" name="id" value={submission.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        <CheckCheck className="size-3.5" />
                        Mark handled
                      </Button>
                    </form>
                  ) : null}

                  <form action={toggleSpamAction}>
                    <input type="hidden" name="id" value={submission.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      <ShieldAlert className="size-3.5" />
                      {submission.isSpam ? "Not spam" : "Spam"}
                    </Button>
                  </form>
                </div>
              </Card>
            );
          })
        )}

        <Pager
          basePath="/website/enquiries"
          searchParams={params}
          page={page}
          perPage={PER_PAGE}
          total={total}
          label="enquiries"
        />
      </div>
      )}
    </>
  );
}
