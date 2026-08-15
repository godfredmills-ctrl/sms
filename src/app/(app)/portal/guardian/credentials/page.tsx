import type { Metadata } from "next";
import { Award, Download, FileText, ShieldCheck } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { credentialsForStudents } from "@/lib/credentials";
import { env } from "@/lib/env";
import { formatDate, fullName, humanise, toNumber } from "@/lib/utils";

import { NotLinked } from "../not-linked";
import { wardsFor } from "../wards";

export const metadata: Metadata = { title: "Certificates & transcripts" };
export const dynamic = "force-dynamic";

export default async function GuardianCredentialsPage() {
  const user = await requireUser();
  if (!user.guardianId) return <NotLinked title="Certificates & transcripts" />;

  const links = await wardsFor(user.guardianId);
  if (!links.length) return <NotLinked title="Certificates & transcripts" />;

  // Same rule as the results page: only children whose record lists you as a
  // recipient of academic reports.
  const entitled = links.filter((link) => link.receivesReports);

  const { certificates, transcripts } = await credentialsForStudents(
    entitled.map((link) => link.student.id),
  );

  const live = certificates.filter((entry) => !entry.revokedAt);

  return (
    <>
      <PageHeader
        title="Certificates & transcripts"
        description="Official documents issued to your children, ready to download."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Certificates"
          value={live.length}
          tone="violet"
          icon={<Award className="size-4" />}
        />
        <StatCard
          label="Transcripts"
          value={transcripts.filter((entry) => !entry.revokedAt).length}
          tone="info"
          icon={<FileText className="size-4" />}
        />
        <StatCard label="Children covered" value={entitled.length} tone="teal" />
        <StatCard
          label="Withdrawn"
          value={
            certificates.filter((entry) => entry.revokedAt).length +
            transcripts.filter((entry) => entry.revokedAt).length
          }
          hint="Kept on record"
          tone={
            certificates.some((entry) => entry.revokedAt) ? "warning" : "neutral"
          }
        />
      </div>

      {entitled.length < links.length ? (
        <Alert tone="info" className="mb-4">
          Documents are shown only for children whose record lists you as a recipient
          of academic reports. The school office can change that.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Certificates" />
          {certificates.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {certificates.map((certificate) => (
                <li key={certificate.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-sm font-medium ${
                            certificate.revokedAt
                              ? "text-[var(--text-subtle)] line-through"
                              : ""
                          }`}
                        >
                          {certificate.title}
                        </span>
                        <Badge tone="neutral">{humanise(certificate.kind)}</Badge>
                        {certificate.revokedAt ? (
                          <Badge tone="danger">Withdrawn</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        {fullName(certificate.student!)} ·{" "}
                        {formatDate(certificate.issuedOn)}
                      </p>
                      <p className="numeric text-xs text-[var(--text-subtle)]">
                        {certificate.serialNumber}
                      </p>
                      {certificate.awardedFor ? (
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {certificate.awardedFor}
                        </p>
                      ) : null}
                      {certificate.revokedAt ? (
                        <p className="mt-0.5 text-xs text-[var(--danger)]">
                          {certificate.revokeReason}
                        </p>
                      ) : null}
                    </div>

                    {!certificate.revokedAt ? (
                      <a
                        href={`/api/credentials/certificate/${certificate.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                      >
                        <Download className="size-3.5" />
                        PDF
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<Award className="size-5" />}
              title="No certificates yet"
              description="Awards and completion certificates appear here once the school issues them."
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Transcripts" />
          {transcripts.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {transcripts.map((transcript) => (
                <li key={transcript.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-sm font-medium ${
                            transcript.revokedAt
                              ? "text-[var(--text-subtle)] line-through"
                              : ""
                          }`}
                        >
                          {fullName(transcript.student!)}
                        </span>
                        {transcript.classification ? (
                          <Badge tone="success">{transcript.classification}</Badge>
                        ) : null}
                        {transcript.revokedAt ? (
                          <Badge tone="danger">Withdrawn</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        {transcript.purpose ?? "Academic transcript"} ·{" "}
                        {formatDate(transcript.issuedAt)}
                      </p>
                      <p className="numeric text-xs text-[var(--text-subtle)]">
                        {transcript.serialNumber}
                        {transcript.cumulativeGpa
                          ? ` · GPA ${toNumber(transcript.cumulativeGpa)?.toFixed(2)}`
                          : ""}
                      </p>
                    </div>

                    {!transcript.revokedAt ? (
                      <a
                        href={`/api/credentials/transcript/${transcript.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                      >
                        <Download className="size-3.5" />
                        PDF
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<FileText className="size-5" />}
              title="No transcripts yet"
              description="Ask the school office if you need one for an application."
            />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardBody className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Every document carries a verification code. Anyone receiving one — a
            university, an employer — can confirm it is genuine at{" "}
            <span className="font-mono">{env.appUrl}/verify/&lt;code&gt;</span> without
            needing an account. A withdrawn document reports itself as withdrawn
            rather than disappearing.
          </span>
        </CardBody>
      </Card>
    </>
  );
}
