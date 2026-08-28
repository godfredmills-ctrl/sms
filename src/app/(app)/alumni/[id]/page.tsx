import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Briefcase,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";

import {
  Alert,
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import {
  cohortLabel,
  donationTotals,
  engagementLabel,
  engagementScore,
  reachability,
  yearsSince,
} from "@/lib/alumni-rules";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate, formatPhone } from "@/lib/utils";

import { AlumnusButton, EngagementButton, VerifyButton } from "../alumni-forms";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const alumnus = await db.alumnus
    .findUnique({ where: { id }, select: { firstName: true, lastName: true } })
    .catch(() => null);
  return {
    title: alumnus ? `${alumnus.firstName} ${alumnus.lastName}` : "Alumnus",
  };
}

export default async function AlumnusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("alumni.read");
  const canManage = userCan(user, "alumni.manage");
  const canContact = userCan(user, "alumni.contact");
  const canRecord = userCan(user, "alumni.engagement.record");

  const { id } = await params;
  const now = new Date();

  const alumnus = await db.alumnus.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, admissionNo: true } },
      engagements: { orderBy: { happenedOn: "desc" } },
    },
  });
  if (!alumnus) notFound();

  const name = [alumnus.title, alumnus.firstName, alumnus.otherNames, alumnus.lastName]
    .filter(Boolean)
    .join(" ");
  const state = reachability(alumnus, now);
  const donations = donationTotals(alumnus.engagements);
  const score = engagementScore(alumnus.engagements, now);

  const values = {
    id: alumnus.id,
    title: alumnus.title ?? "",
    firstName: alumnus.firstName,
    lastName: alumnus.lastName,
    otherNames: alumnus.otherNames ?? "",
    nameAtSchool: alumnus.nameAtSchool ?? "",
    gender: alumnus.gender,
    graduationYear: String(alumnus.graduationYear),
    finalClass: alumnus.finalClass ?? "",
    completed: alumnus.completed,
    email: alumnus.email ?? "",
    phone: alumnus.phone ?? "",
    whatsapp: alumnus.whatsapp ?? "",
    address: alumnus.address ?? "",
    city: alumnus.city ?? "",
    country: alumnus.country ?? "Ghana",
    university: alumnus.university ?? "",
    course: alumnus.course ?? "",
    occupation: alumnus.occupation ?? "",
    employer: alumnus.employer ?? "",
    jobTitle: alumnus.jobTitle ?? "",
    linkedinUrl: alumnus.linkedinUrl ?? "",
    achievements: alumnus.achievements ?? "",
    consentToContact: alumnus.consentToContact,
    consentSource: alumnus.consentSource ?? "",
    deceasedOn: alumnus.deceasedOn
      ? `${alumnus.deceasedOn.getFullYear()}-${String(alumnus.deceasedOn.getMonth() + 1).padStart(2, "0")}-${String(alumnus.deceasedOn.getDate()).padStart(2, "0")}`
      : "",
    notes: alumnus.notes ?? "",
  };

  return (
    <>
      <PageHeader
        title={name}
        description={`${cohortLabel(alumnus.graduationYear)}${alumnus.finalClass ? `, ${alumnus.finalClass}` : ""}. ${yearsSince(alumnus.graduationYear, now)} years ago.`}
        breadcrumb={
          <Link href="/alumni" className="hover:text-[var(--text)]">
            Alumni
          </Link>
        }
        action={
          <>
            {canRecord && !alumnus.deceasedOn ? (
              <EngagementButton alumnusId={alumnus.id} name={alumnus.firstName} />
            ) : null}
            {canManage ? <AlumnusButton values={values} /> : null}
            {alumnus.completed ? null : <Badge tone="warning">Did not complete</Badge>}
          </>
        }
      />

      {alumnus.deceasedOn ? (
        <Alert tone="neutral" className="mb-4">
          Recorded as deceased on {formatDate(alumnus.deceasedOn)}. The school does not
          write to this record. It stays on the register because they are still part
          of {cohortLabel(alumnus.graduationYear).toLowerCase()}.
        </Alert>
      ) : !state.reachable ? (
        <Alert tone="warning" className="mb-4">
          <span className="block font-medium">Not reachable: {state.reason.toLowerCase()}.</span>
          <span className="block">
            {state.mayContact
              ? "The school has their agreement. What is missing is a working way to reach them."
              : "Nothing may be sent to this person until they have agreed and the agreement is recorded."}
          </span>
        </Alert>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Avatar name={name} src={alumnus.photoUrl} size={56} />
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Cohort"
            value={String(alumnus.graduationYear)}
            hint={alumnus.finalClass ?? undefined}
            tone="violet"
            icon={<GraduationCap className="size-4" />}
          />
          <StatCard
            label="Involvement"
            value={score.toFixed(1)}
            hint={`${alumnus.engagements.length} recorded`}
            tone={score > 0 ? "success" : "neutral"}
          />
          <StatCard
            label="Given"
            value={formatMoney(donations.totalMinor)}
            hint={`${donations.count} gifts`}
            tone="teal"
          />
          <StatCard
            label="Details checked"
            value={alumnus.verifiedAt ? formatDate(alumnus.verifiedAt) : "Never"}
            hint={alumnus.verifiedBy ? `by ${alumnus.verifiedBy}` : "Nobody has confirmed these"}
            tone={state.stale ? "warning" : "success"}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Contact" />
          <CardBody className="space-y-2.5 text-sm">
            <p className="flex items-center gap-2">
              <Mail className="size-3.5 shrink-0 text-[var(--text-subtle)]" />
              {alumnus.email ? (
                <a href={`mailto:${alumnus.email}`} className="truncate hover:text-[var(--primary)]">
                  {alumnus.email}
                </a>
              ) : (
                <span className="text-[var(--text-subtle)]">No email</span>
              )}
            </p>
            <p className="flex items-center gap-2">
              <Phone className="size-3.5 shrink-0 text-[var(--text-subtle)]" />
              {alumnus.phone ? (
                <a href={`tel:${alumnus.phone}`} className="numeric hover:text-[var(--primary)]">
                  {formatPhone(alumnus.phone)}
                </a>
              ) : (
                <span className="text-[var(--text-subtle)]">No phone</span>
              )}
            </p>
            {alumnus.whatsapp ? (
              <p className="numeric flex items-center gap-2 text-[var(--text-muted)]">
                <Phone className="size-3.5 shrink-0 text-[var(--text-subtle)]" />
                {formatPhone(alumnus.whatsapp)} on WhatsApp
              </p>
            ) : null}
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--text-subtle)]" />
              <span>
                {[alumnus.address, alumnus.city, alumnus.country].filter(Boolean).join(", ") ||
                  "No address"}
              </span>
            </p>

            {canContact && !alumnus.deceasedOn ? (
              <div className="border-t border-[var(--border)] pt-3">
                <VerifyButton id={alumnus.id} name={alumnus.firstName} />
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                  Press this when somebody has actually checked. It is the
                  difference between a register of nine hundred names and a list
                  of people who can be written to.
                </p>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Permission"
            action={<ShieldCheck className="size-4 text-[var(--text-subtle)]" />}
          />
          <CardBody className="space-y-2 text-sm">
            {alumnus.consentToContact ? (
              <>
                <Badge tone="success">Agreed to be contacted</Badge>
                <p className="text-[var(--text-muted)]">
                  {alumnus.consentSource ?? "No source recorded"}
                </p>
                {alumnus.consentAt ? (
                  <p className="text-[var(--text-muted)]">
                    Recorded {formatDate(alumnus.consentAt)}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <Badge tone="neutral">Has not agreed</Badge>
                <p className="leading-relaxed text-[var(--text-muted)]">
                  Nothing may be sent to this person. Leaving school is not
                  agreement, and under the Data Protection Act 2012 the school
                  has to be able to say when and how somebody agreed.
                </p>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Since leaving"
            action={<Briefcase className="size-4 text-[var(--text-subtle)]" />}
          />
          <CardBody className="space-y-2 text-sm">
            <dl className="space-y-2">
              {[
                ["University", alumnus.university],
                ["Course", alumnus.course],
                ["Occupation", alumnus.occupation],
                ["Employer", alumnus.employer],
                ["Job title", alumnus.jobTitle],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
                  <dd>{value || <span className="text-[var(--text-subtle)]">-</span>}</dd>
                </div>
              ))}
            </dl>
            {alumnus.linkedinUrl ? (
              <a
                href={alumnus.linkedinUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="block truncate text-xs hover:text-[var(--primary)]"
              >
                {alumnus.linkedinUrl}
              </a>
            ) : null}
            {alumnus.achievements ? (
              <p className="border-t border-[var(--border)] pt-2 leading-relaxed text-[var(--text-muted)]">
                {alumnus.achievements}
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="What they have done with the school"
          description={
            alumnus.engagements.length
              ? "Weighted by what it cost them rather than what it was worth, and decayed over five years."
              : undefined
          }
        />
        <CardBody>
          {alumnus.engagements.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Nothing recorded. Somebody who has never been asked is not somebody
              who said no.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {alumnus.engagements.map((engagement) => (
                <li key={engagement.id} className="flex items-start gap-3 py-2.5">
                  <Badge tone="info">{engagementLabel(engagement.kind)}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{engagement.summary}</p>
                    {engagement.detail ? (
                      <p className="text-xs text-[var(--text-muted)]">{engagement.detail}</p>
                    ) : null}
                    <p className="text-xs text-[var(--text-subtle)]">
                      {formatDate(engagement.happenedOn)}
                      {engagement.recordedBy ? ` · recorded by ${engagement.recordedBy}` : ""}
                    </p>
                  </div>
                  {engagement.amountMinor > 0 ? (
                    <span className="numeric shrink-0 text-sm font-medium">
                      {formatMoney(engagement.amountMinor)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {alumnus.student ? (
        <p className="mt-4 text-xs text-[var(--text-subtle)]">
          Linked to their pupil record,{" "}
          <Link href={`/students/${alumnus.student.id}`} className="hover:text-[var(--text)]">
            {alumnus.student.admissionNo}
          </Link>
          .
        </p>
      ) : (
        <p className="mt-4 text-xs text-[var(--text-subtle)]">
          Not linked to a pupil record. They left before the school had one.
        </p>
      )}

      {alumnus.notes ? (
        <Card className="mt-4">
          <CardHeader title="Notes" />
          <CardBody>
            <p className="text-sm leading-relaxed whitespace-pre-line">{alumnus.notes}</p>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
