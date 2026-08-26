import type { Metadata } from "next";
import { Award, Download, FileText, ShieldCheck } from "lucide-react";

import {
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
import { formatDate, humanise, toNumber } from "@/lib/utils";

import { NotLinked } from "../not-linked";

export const metadata: Metadata = { title: "My Certificates" };
export const dynamic = "force-dynamic";

export default async function StudentCredentialsPage() {
  const user = await requireUser();
  if (!user.studentId) return <NotLinked title="My Certificates" />;

  const { certificates, transcripts } = await credentialsForStudents([
    user.studentId,
  ]);

  const live = certificates.filter((entry) => !entry.revokedAt);
  const liveTranscripts = transcripts.filter((entry) => !entry.revokedAt);

  return (
    <>
      <PageHeader
        title="My certificates & transcripts"
        description="Official documents the school has issued to you."
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
          value={liveTranscripts.length}
          tone="info"
          icon={<FileText className="size-4" />}
        />
        <StatCard
          label="Most recent"
          value={
            live[0]
              ? formatDate(live[0].issuedOn)
              : liveTranscripts[0]
                ? formatDate(liveTranscripts[0].issuedAt)
                : "-"
          }
          tone="teal"
        />
        <StatCard
          label="Best classification"
          value={liveTranscripts.find((entry) => entry.classification)?.classification ?? "-"}
          tone="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Certificates" />
          {live.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {live.map((certificate) => (
                <li
                  key={certificate.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{certificate.title}</span>
                      <Badge tone="neutral">{humanise(certificate.kind)}</Badge>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {formatDate(certificate.issuedOn)}
                      {certificate.awardedFor ? ` · ${certificate.awardedFor}` : ""}
                    </p>
                    <p className="numeric text-xs text-[var(--text-subtle)]">
                      {certificate.serialNumber}
                    </p>
                  </div>
                  <a
                    href={`/api/credentials/certificate/${certificate.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                  >
                    <Download className="size-3.5" />
                    PDF
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<Award className="size-5" />}
              title="No certificates yet"
              description="Awards and completion certificates appear here once issued."
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Transcripts" />
          {liveTranscripts.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {liveTranscripts.map((transcript) => (
                <li
                  key={transcript.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">
                        {transcript.purpose ?? "Academic transcript"}
                      </span>
                      {transcript.classification ? (
                        <Badge tone="success">{transcript.classification}</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {formatDate(transcript.issuedAt)}
                      {transcript.cumulativeGpa
                        ? ` · GPA ${toNumber(transcript.cumulativeGpa)?.toFixed(2)}`
                        : ""}
                    </p>
                    <p className="numeric text-xs text-[var(--text-subtle)]">
                      {transcript.serialNumber}
                    </p>
                  </div>
                  <a
                    href={`/api/credentials/transcript/${transcript.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                  >
                    <Download className="size-3.5" />
                    PDF
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<FileText className="size-5" />}
              title="No transcripts yet"
              description="Ask the school office if you need one for a university application."
            />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardBody className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Each document carries a verification code. A university or employer can
            confirm it is genuine at{" "}
            <span className="font-mono">{env.appUrl}/verify/&lt;code&gt;</span> without
            an account: so you can send the PDF and they can check it themselves.
          </span>
        </CardBody>
      </Card>
    </>
  );
}
