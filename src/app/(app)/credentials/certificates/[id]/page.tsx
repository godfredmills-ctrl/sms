import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";

import { Alert } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Certificate" };
export const dynamic = "force-dynamic";

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("assessment.certificate.issue");
  const { id } = await params;

  const certificate = await db.issuedCertificate.findUnique({
    where: { id },
    include: { template: { select: { name: true, layout: true, orientation: true } } },
  });

  if (!certificate) notFound();

  const school = await db.school.findFirst({
    select: { name: true, motto: true, logoUrl: true, city: true },
  });

  const layout = (certificate.template.layout ?? {}) as {
    accent?: string;
    border?: string;
  };
  const accent = layout.accent ?? "#128257";
  const border = layout.border ?? "classic";

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
          <h1 className="mt-1 text-xl font-semibold">{certificate.title}</h1>
          <p className="numeric text-sm text-[var(--text-muted)]">
            {certificate.serialNumber} · {certificate.template.name}
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <a
            href={`/api/credentials/certificate/${certificate.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--bg-subtle)]"
          >
            <Download className="size-4" />
            PDF
          </a>
          <PrintButton label="Print certificate" />
        </div>
      </div>

      {certificate.revokedAt ? (
        <Alert tone="danger" title="This certificate has been revoked" className="no-print mb-4">
          {certificate.revokeReason} — revoked {formatDate(certificate.revokedAt)}.
        </Alert>
      ) : null}

      {/* Landscape A4. The border weight is what makes a certificate read as
          a certificate rather than a letter, so it is drawn, not implied. */}
      <div
        className="print-page mx-auto aspect-[297/210] w-full max-w-[297mm] bg-white p-3 shadow-sm print:shadow-none"
        style={{ color: "#111" }}
      >
        <div
          className="flex h-full flex-col items-center justify-center px-12 py-8 text-center"
          style={{
            border:
              border === "minimal"
                ? `2px solid ${accent}`
                : `10px double ${accent}`,
            outline: border === "ornate" ? `2px solid ${accent}` : undefined,
            outlineOffset: border === "ornate" ? "6px" : undefined,
          }}
        >
          {school?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="mb-3 size-16 object-contain" />
          ) : null}

          <p className="text-sm font-semibold tracking-[0.3em] uppercase" style={{ color: accent }}>
            {school?.name}
          </p>
          {school?.motto ? (
            <p className="text-[11px] italic opacity-70">{school.motto}</p>
          ) : null}

          <h2
            className="mt-6 text-3xl font-bold tracking-wide uppercase"
            style={{ color: accent }}
          >
            {certificate.title}
          </h2>

          <p className="mt-6 text-sm opacity-80">This is to certify that</p>

          <p className="mt-2 border-b px-8 pb-1 text-2xl font-semibold" style={{ borderColor: accent }}>
            {certificate.recipientName}
          </p>

          {certificate.awardedFor ? (
            <p className="mt-5 max-w-2xl text-sm leading-relaxed opacity-90">
              {certificate.awardedFor}
            </p>
          ) : null}

          <p className="mt-5 text-sm opacity-80">
            Given at {school?.city ?? "the school"} on{" "}
            {formatDate(certificate.issuedOn, "long")}
          </p>

          <div className="mt-auto flex w-full items-end justify-between pt-10 text-[10px]">
            <div className="text-left">
              <p className="numeric opacity-60">{certificate.serialNumber}</p>
              <p className="opacity-60">
                Verify at {env.appUrl}/verify/{certificate.verifyCode}
              </p>
            </div>
            <div className="text-right">
              <p className="w-56 border-t pt-1" style={{ borderColor: accent }}>
                {certificate.signedBy ?? " "}
              </p>
              <p className="opacity-70">{certificate.signatoryTitle ?? "Head Teacher"}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
