import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderTablePdf, renderTemplatePdf } from "@/lib/pdf";
import { readStoredFile, storeFile } from "@/lib/storage";
import { formatDate, fullName, toNumber } from "@/lib/utils";

/**
 * Generates a certificate or transcript as a real PDF.
 *
 * The file is generated once and stored, then served from storage afterwards.
 * A credential is a fixed record of what was awarded: re-rendering it on every
 * download would let a later template edit silently change a document a family
 * already holds a printed copy of.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;

  let user;
  try {
    user = await authorize(
      kind === "transcript"
        ? "assessment.transcript.generate"
        : "assessment.certificate.issue",
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const regenerate = new URL(request.url).searchParams.get("regenerate") === "1";

  if (kind === "certificate") {
    return certificate(id, user.id, regenerate);
  }
  if (kind === "transcript") {
    return transcript(id, user.id, regenerate);
  }

  return NextResponse.json({ error: "Unknown credential type." }, { status: 400 });
}

function pdfResponse(bytes: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function certificate(id: string, userId: string, regenerate: boolean) {
  const record = await db.issuedCertificate.findUnique({
    where: { id },
    include: {
      template: true,
      student: {
        select: {
          firstName: true,
          lastName: true,
          otherNames: true,
          admissionNo: true,
          dateOfBirth: true,
          enrollments: {
            where: { status: "ACTIVE" },
            take: 1,
            select: {
              classSection: {
                select: { name: true, classLevel: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (record.fileId && !regenerate) {
    const asset = await db.fileAsset.findUnique({
      where: { id: record.fileId },
      select: { storageKey: true },
    });
    if (asset) {
      const bytes = await readStoredFile(asset.storageKey);
      return pdfResponse(bytes, `${record.serialNumber.replace(/\//g, "-")}.pdf`);
    }
  }

  const school = await db.school.findFirst({
    select: {
      name: true,
      motto: true,
      addressLine1: true,
      city: true,
      logoUrl: true,
    },
  });

  const section = record.student?.enrollments[0]?.classSection;

  const bytes = await renderTemplatePdf({
    layout: record.template.layout,
    pageSize: record.template.pageSize,
    orientation: record.template.orientation,
    context: {
      student: {
        fullName: record.student ? fullName(record.student) : record.recipientName,
        firstName: record.student?.firstName ?? record.recipientName.split(" ")[0],
        lastName: record.student?.lastName ?? "",
        admissionNo: record.student?.admissionNo ?? "",
        dateOfBirth: formatDate(record.student?.dateOfBirth),
        className: section ? `${section.classLevel.name} ${section.name}` : "",
      },
      school: {
        name: school?.name ?? "",
        motto: school?.motto ?? "",
        address: [school?.addressLine1, school?.city].filter(Boolean).join(", "),
        logoUrl: school?.logoUrl ?? "",
      },
      document: {
        title: record.title,
        serialNumber: record.serialNumber,
        issuedOn: formatDate(record.issuedOn),
        awardedFor: record.awardedFor ?? "",
        verifyCode: record.verifyCode,
        signedBy: record.signedBy ?? "",
        signatoryTitle: record.signatoryTitle ?? "",
      },
    },
  });

  const stored = await storeFile({
    buffer: bytes,
    originalName: `${record.serialNumber.replace(/\//g, "-")}.pdf`,
    mimeType: "application/pdf",
    folder: "certificates",
    uploadedById: userId,
    // System-generated, so it bypasses the upload allow-list.
    trusted: true,
  });

  await db.issuedCertificate.update({
    where: { id },
    data: { fileId: stored.id },
  });

  return pdfResponse(bytes, stored.originalName);
}

async function transcript(id: string, userId: string, regenerate: boolean) {
  const record = await db.transcript.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          firstName: true,
          lastName: true,
          otherNames: true,
          admissionNo: true,
          dateOfBirth: true,
        },
      },
      lines: { orderBy: [{ academicYear: "asc" }, { termName: "asc" }] },
    },
  });

  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (record.fileId && !regenerate) {
    const asset = await db.fileAsset.findUnique({
      where: { id: record.fileId },
      select: { storageKey: true },
    });
    if (asset) {
      const bytes = await readStoredFile(asset.storageKey);
      return pdfResponse(bytes, `${record.serialNumber.replace(/\//g, "-")}.pdf`);
    }
  }

  const school = await db.school.findFirst({
    select: { name: true, addressLine1: true, city: true },
  });

  const bytes = await renderTablePdf({
    title: `${school?.name ?? "School"} — Academic Transcript`,
    subtitle: [
      fullName(record.student),
      record.student.admissionNo,
      record.purpose ? `Issued for: ${record.purpose}` : null,
      `Serial ${record.serialNumber}`,
      `Issued ${formatDate(record.issuedAt)}`,
    ]
      .filter(Boolean)
      .join("  ·  "),
    headers: ["Year", "Term", "Subject", "Score", "Grade", "Point", "Credits"],
    rows: record.lines.map((line) => [
      line.academicYear,
      line.termName,
      line.subjectName,
      toNumber(line.score)?.toFixed(1) ?? "—",
      line.grade ?? "—",
      toNumber(line.point)?.toFixed(2) ?? "—",
      toNumber(line.credits)?.toFixed(1) ?? "—",
    ]),
    footer: `Cumulative GPA ${toNumber(record.cumulativeGpa)?.toFixed(2) ?? "—"}${
      record.classification ? ` · ${record.classification}` : ""
    } · Verify at /verify/${record.verifyCode} · This document is void if altered.`,
  });

  const stored = await storeFile({
    buffer: bytes,
    originalName: `${record.serialNumber.replace(/\//g, "-")}.pdf`,
    mimeType: "application/pdf",
    folder: "transcripts",
    uploadedById: userId,
    trusted: true,
  });

  await db.transcript.update({
    where: { id },
    data: { fileId: stored.id },
  });

  return pdfResponse(bytes, stored.originalName);
}
