import type { Metadata } from "next";
import { BadgeCheck, ShieldX } from "lucide-react";

import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Verify a document",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

/**
 * Public verification.
 *
 * Deliberately outside the authenticated app: a university or employer
 * checking a transcript has no account here. It confirms authenticity and
 * shows only what a verifier needs — never marks, never contact details.
 */
export default async function VerifyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const normalised = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  const [transcript, certificate, school] = await Promise.all([
    db.transcript.findUnique({
      where: { verifyCode: normalised },
      select: {
        serialNumber: true,
        issuedAt: true,
        revokedAt: true,
        revokeReason: true,
        isOfficial: true,
        purpose: true,
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
      },
    }),
    db.issuedCertificate.findUnique({
      where: { verifyCode: normalised },
      select: {
        serialNumber: true,
        title: true,
        kind: true,
        recipientName: true,
        issuedOn: true,
        revokedAt: true,
        revokeReason: true,
        awardedFor: true,
      },
    }),
    db.school.findFirst({ select: { name: true, logoUrl: true } }),
  ]);

  const found = transcript ?? certificate;
  const revoked = found?.revokedAt ?? null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] p-6">
      <div className="card w-full max-w-lg p-6">
        <div className="mb-4 flex items-center gap-3 border-b border-[var(--border)] pb-4">
          {school?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="size-10 object-contain" />
          ) : null}
          <div>
            <p className="text-sm font-semibold">{school?.name ?? "School"}</p>
            <p className="text-xs text-[var(--text-muted)]">Document verification</p>
          </div>
        </div>

        {!found ? (
          <div className="py-8 text-center">
            <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
              <ShieldX className="size-6" />
            </span>
            <h1 className="text-lg font-semibold">No document found</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              The code <span className="numeric font-medium">{normalised}</span> does not
              match any document issued by this school. Check it was typed correctly.
            </p>
          </div>
        ) : revoked ? (
          <div className="py-8 text-center">
            <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
              <ShieldX className="size-6" />
            </span>
            <h1 className="text-lg font-semibold">This document has been withdrawn</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              It was issued by this school but revoked on {formatDate(revoked)}.
              {found.revokeReason ? ` Reason: ${found.revokeReason}.` : ""} It should not
              be relied upon.
            </p>
          </div>
        ) : (
          <div className="py-6">
            <div className="mb-5 text-center">
              <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
                <BadgeCheck className="size-6" />
              </span>
              <h1 className="text-lg font-semibold">Genuine document</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                This document was issued by {school?.name ?? "this school"}.
              </p>
            </div>

            <dl className="space-y-2 text-sm">
              {transcript ? (
                <>
                  <Row label="Type" value="Academic transcript" />
                  <Row
                    label="Student"
                    value={`${transcript.student.firstName} ${transcript.student.lastName}`}
                  />
                  <Row label="Admission number" value={transcript.student.admissionNo} />
                  <Row label="Serial" value={transcript.serialNumber} />
                  <Row label="Issued" value={formatDate(transcript.issuedAt, "long")} />
                  <Row
                    label="Status"
                    value={transcript.isOfficial ? "Official" : "Unofficial copy"}
                  />
                  {transcript.purpose ? (
                    <Row label="Purpose" value={transcript.purpose} />
                  ) : null}
                </>
              ) : certificate ? (
                <>
                  <Row label="Type" value="Certificate" />
                  <Row label="Title" value={certificate.title} />
                  <Row label="Awarded to" value={certificate.recipientName} />
                  {certificate.awardedFor ? (
                    <Row label="For" value={certificate.awardedFor} />
                  ) : null}
                  <Row label="Serial" value={certificate.serialNumber} />
                  <Row label="Issued" value={formatDate(certificate.issuedOn, "long")} />
                </>
              ) : null}
            </dl>
          </div>
        )}

        <p className="mt-4 border-t border-[var(--border)] pt-3 text-center text-xs text-[var(--text-subtle)]">
          Marks and personal details are never shown here. Contact the school directly
          for a full record.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--border)] pb-2 last:border-0">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
