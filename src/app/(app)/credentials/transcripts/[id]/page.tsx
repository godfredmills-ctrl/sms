import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, Badge } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDate, humanise, toNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Transcript" };
export const dynamic = "force-dynamic";

type Snapshot = Awaited<
  ReturnType<typeof import("@/lib/grading").buildTranscriptData>
>;

export default async function TranscriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("assessment.transcript.generate");
  const { id } = await params;

  const transcript = await db.transcript.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          firstName: true,
          otherNames: true,
          lastName: true,
          admissionNo: true,
          dateOfBirth: true,
          gender: true,
          nationality: true,
          admissionDate: true,
          exitDate: true,
        },
      },
    },
  });

  if (!transcript) notFound();

  const school = await db.school.findFirst({
    select: {
      name: true,
      motto: true,
      logoUrl: true,
      addressLine1: true,
      city: true,
      phone: true,
      email: true,
      registrationNo: true,
    },
  });

  // The frozen record, not a fresh computation.
  const snapshot = transcript.snapshot as unknown as NonNullable<Snapshot>;
  const fullName = [
    transcript.student.firstName,
    transcript.student.otherNames,
    transcript.student.lastName,
  ]
    .filter(Boolean)
    .join(" ");

  const verifyUrl = `${env.appUrl}/verify/${transcript.verifyCode}`;

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/credentials"
            className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)]"
          >
            ← Credentials
          </Link>
          <h1 className="mt-1 text-xl font-semibold">Transcript — {fullName}</h1>
          <p className="numeric text-sm text-[var(--text-muted)]">
            {transcript.serialNumber}
          </p>
        </div>
        <PrintButton label="Print transcript" />
      </div>

      {transcript.revokedAt ? (
        <Alert tone="danger" title="This transcript has been revoked" className="no-print mb-4">
          {transcript.revokeReason} — revoked {formatDate(transcript.revokedAt)}.
        </Alert>
      ) : null}

      <div className="print-page mx-auto max-w-[210mm] bg-[var(--bg-elevated)] p-8 text-[12px] shadow-sm print:p-0 print:shadow-none">
        <header className="border-b-2 border-[var(--text)] pb-3 text-center">
          {school?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="mx-auto mb-2 size-16 object-contain" />
          ) : null}
          <h2 className="text-lg font-bold uppercase">{school?.name}</h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            {[school?.addressLine1, school?.city].filter(Boolean).join(", ")}
            {school?.phone ? ` · ${school.phone}` : ""}
          </p>
          {school?.registrationNo ? (
            <p className="text-[10px] text-[var(--text-subtle)]">
              Reg. No. {school.registrationNo}
            </p>
          ) : null}
          <p className="mt-2 text-sm font-bold tracking-[0.2em] uppercase">
            Academic Transcript
          </p>
          {!transcript.isOfficial ? (
            <p className="text-[11px] font-semibold text-[var(--danger)] uppercase">
              Unofficial copy
            </p>
          ) : null}
        </header>

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {[
            { label: "Name", value: fullName },
            { label: "Admission No.", value: transcript.student.admissionNo },
            { label: "Date of birth", value: formatDate(transcript.student.dateOfBirth) },
            { label: "Gender", value: humanise(transcript.student.gender) },
            { label: "Nationality", value: transcript.student.nationality ?? "—" },
            { label: "Admitted", value: formatDate(transcript.student.admissionDate) },
            { label: "Serial", value: transcript.serialNumber },
            { label: "Issued", value: formatDate(transcript.issuedAt) },
            { label: "Purpose", value: transcript.purpose ?? "—" },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-[9px] tracking-wide text-[var(--text-subtle)] uppercase">
                {item.label}
              </dt>
              <dd className="font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>

        {snapshot.terms.map((term, index) => (
          <section key={index} className="mt-4">
            <h3 className="border-b border-[var(--border-strong)] pb-0.5 text-[11px] font-bold uppercase">
              {term.academicYear} — {term.termName} · {term.className}
            </h3>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-1 text-left text-[10px] font-semibold">Subject</th>
                  <th className="py-1 text-right text-[10px] font-semibold">Score</th>
                  <th className="py-1 text-center text-[10px] font-semibold">Grade</th>
                  <th className="py-1 text-right text-[10px] font-semibold">Point</th>
                  <th className="py-1 text-left text-[10px] font-semibold">Remark</th>
                </tr>
              </thead>
              <tbody>
                {term.lines.map((line, lineIndex) => (
                  <tr key={lineIndex} className="border-b border-[var(--border)]">
                    <td className="py-0.5">{line.subjectName}</td>
                    <td className="numeric py-0.5 text-right">
                      {line.score?.toFixed(1) ?? "—"}
                    </td>
                    <td className="py-0.5 text-center font-medium">{line.grade ?? "—"}</td>
                    <td className="numeric py-0.5 text-right">{line.point ?? "—"}</td>
                    <td className="py-0.5 text-[10px]">{line.remark ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-right text-[10px]">
              Term average{" "}
              <span className="numeric font-semibold">
                {term.average?.toFixed(1) ?? "—"}%
              </span>
              {term.position ? ` · Position ${term.position} of ${term.classSize}` : ""}
            </p>
          </section>
        ))}

        <div className="mt-5 flex items-end justify-between border-t-2 border-[var(--text)] pt-3">
          <div className="text-[11px]">
            <p>
              Cumulative GPA:{" "}
              <span className="numeric font-bold">
                {toNumber(transcript.cumulativeGpa)?.toFixed(2) ?? "—"}
              </span>
            </p>
            {transcript.classification ? (
              <p>Classification: {transcript.classification}</p>
            ) : null}
            <p className="mt-4 border-t border-[var(--text)] pt-1">
              Registrar&apos;s signature and school seal
            </p>
          </div>

          <div className="text-right text-[9px] text-[var(--text-muted)]">
            <p className="font-semibold">Verify this document</p>
            <p className="numeric">{transcript.verifyCode}</p>
            <p className="break-all">{verifyUrl}</p>
          </div>
        </div>

        <p className="mt-3 text-center text-[9px] text-[var(--text-subtle)]">
          This transcript is a frozen record of results certified on{" "}
          {formatDate(transcript.issuedAt)}. Any alteration renders it invalid.
        </p>
      </div>

      <div className="no-print mx-auto mt-4 max-w-[210mm]">
        <Badge tone="neutral">
          Verification code {transcript.verifyCode} — anyone can check this at{" "}
          {verifyUrl}
        </Badge>
      </div>
    </>
  );
}
