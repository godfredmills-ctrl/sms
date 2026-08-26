import "server-only";

import { db } from "@/lib/db";
import { loadDocumentImage, resolveTemplateImages } from "@/lib/document-images";
import { env } from "@/lib/env";
import { renderTablePdf, renderTemplatePdf } from "@/lib/pdf";
import { readStoredFile, storeFile } from "@/lib/storage";
import { formatDate, fullName, toNumber } from "@/lib/utils";

/**
 * Produces the PDF for a credential, generating and storing it the first time.
 *
 * Shared by the download route and the email action so a family cannot receive
 * a document by email that differs from the one they download. Generated once
 * and reused: a credential is a fixed record of what was awarded, and
 * re-rendering on every request would let a later template edit silently change
 * a document somebody already holds a printed copy of.
 */
export async function renderCredentialPdf(
  kind: "certificate" | "transcript",
  id: string,
  options: { regenerate?: boolean; storedById?: string | null } = {},
): Promise<Buffer> {
  return kind === "certificate"
    ? certificatePdf(id, options)
    : transcriptPdf(id, options);
}

/** The stored file, when there is one and we are not deliberately redoing it. */
async function cached(
  fileId: string | null,
  regenerate: boolean,
): Promise<Buffer | null> {
  if (!fileId || regenerate) return null;

  const asset = await db.fileAsset.findUnique({
    where: { id: fileId },
    select: { storageKey: true, deletedAt: true },
  });
  if (!asset || asset.deletedAt) return null;

  try {
    return await readStoredFile(asset.storageKey);
  } catch {
    // The row survived but the object did not — fall through and rebuild it
    // rather than failing a download the school is standing over.
    return null;
  }
}

async function certificatePdf(
  id: string,
  options: { regenerate?: boolean; storedById?: string | null },
): Promise<Buffer> {
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
          photoUrl: true,
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

  if (!record) throw new Error("Certificate not found.");

  const existing = await cached(record.fileId, options.regenerate ?? false);
  if (existing) return existing;

  const school = await db.school.findFirst({
    select: {
      name: true,
      motto: true,
      addressLine1: true,
      city: true,
      logoUrl: true,
      crestUrl: true,
    },
  });

  const section = record.student?.enrollments[0]?.classSection;

  const context = {
    student: {
      fullName: record.student ? fullName(record.student) : record.recipientName,
      firstName: record.student?.firstName ?? record.recipientName.split(" ")[0],
      lastName: record.student?.lastName ?? "",
      admissionNo: record.student?.admissionNo ?? "",
      dateOfBirth: formatDate(record.student?.dateOfBirth),
      className: section ? `${section.classLevel.name} ${section.name}` : "",
      photoUrl: record.student?.photoUrl ?? "",
    },
    school: {
      name: school?.name ?? "",
      motto: school?.motto ?? "",
      address: [school?.addressLine1, school?.city].filter(Boolean).join(", "),
      logoUrl: school?.logoUrl ?? "",
      crestUrl: school?.crestUrl ?? "",
    },
    document: {
      title: record.title,
      serialNumber: record.serialNumber,
      issuedOn: formatDate(record.issuedOn),
      awardedFor: record.awardedFor ?? "",
      verifyCode: record.verifyCode,
      verifyUrl: `${env.appUrl}/verify/${record.verifyCode}`,
      signedBy: record.signedBy ?? "",
      signatoryTitle: record.signatoryTitle ?? "",
    },
  };

  const bytes = await renderTemplatePdf({
    layout: record.template.layout,
    pageSize: record.template.pageSize,
    orientation: record.template.orientation,
    context,
    images: await resolveTemplateImages(record.template.layout, context),
  });

  const stored = await storeFile({
    buffer: bytes,
    originalName: `${record.serialNumber.replace(/\//g, "-")}.pdf`,
    mimeType: "application/pdf",
    folder: "certificates",
    uploadedById: options.storedById ?? null,
    // System-generated, so it bypasses the upload allow-list.
    trusted: true,
  });

  await db.issuedCertificate.update({
    where: { id },
    data: { fileId: stored.id },
  });

  return bytes;
}

async function transcriptPdf(
  id: string,
  options: { regenerate?: boolean; storedById?: string | null },
): Promise<Buffer> {
  const record = await db.transcript.findUnique({
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
          photoUrl: true,
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
      lines: { orderBy: [{ academicYear: "asc" }, { termName: "asc" }] },
    },
  });

  if (!record) throw new Error("Transcript not found.");

  const existing = await cached(record.fileId, options.regenerate ?? false);
  if (existing) return existing;

  const school = await db.school.findFirst({
    select: {
      name: true,
      motto: true,
      addressLine1: true,
      city: true,
      logoUrl: true,
      crestUrl: true,
    },
  });

  const headers = ["Year", "Term", "Subject", "Score", "Grade", "Point", "Credits"];
  const rows = record.lines.map((line) => [
    line.academicYear,
    line.termName,
    line.subjectName,
    toNumber(line.score)?.toFixed(1) ?? "-",
    line.grade ?? "-",
    toNumber(line.point)?.toFixed(2) ?? "-",
    toNumber(line.credits)?.toFixed(1) ?? "-",
  ]);

  // A template is used when one is attached. The built-in layout below is the
  // fallback for a school that has not designed one — not the default for a
  // school that has.
  if (record.template) {
    const section = record.student.enrollments[0]?.classSection;

    const context = {
      student: {
        fullName: fullName(record.student),
        firstName: record.student.firstName,
        lastName: record.student.lastName,
        admissionNo: record.student.admissionNo,
        dateOfBirth: formatDate(record.student.dateOfBirth),
        className: section ? `${section.classLevel.name} ${section.name}` : "",
        photoUrl: record.student.photoUrl ?? "",
      },
      school: {
        name: school?.name ?? "",
        motto: school?.motto ?? "",
        address: [school?.addressLine1, school?.city].filter(Boolean).join(", "),
        logoUrl: school?.logoUrl ?? "",
        crestUrl: school?.crestUrl ?? "",
      },
      document: {
        title: record.purpose ?? "Academic Transcript",
        serialNumber: record.serialNumber,
        issuedOn: formatDate(record.issuedAt),
        awardedFor: record.issuedTo ?? "",
        verifyCode: record.verifyCode,
        verifyUrl: `${env.appUrl}/verify/${record.verifyCode}`,
        signedBy: "",
        signatoryTitle: "",
      },
      academic: {
        cumulativeGpa: toNumber(record.cumulativeGpa)?.toFixed(2) ?? "-",
        classification: record.classification ?? "",
        totalCredits: toNumber(record.totalCredits)?.toFixed(1) ?? "-",
      },
    };

    const templated = await renderTemplatePdf({
      layout: record.template.layout,
      pageSize: record.template.pageSize,
      orientation: record.template.orientation,
      table: { headers, rows },
      context,
      images: await resolveTemplateImages(record.template.layout, context),
    });

    const storedTemplated = await storeFile({
      buffer: templated,
      originalName: `${record.serialNumber.replace(/\//g, "-")}.pdf`,
      mimeType: "application/pdf",
      folder: "transcripts",
      uploadedById: options.storedById ?? null,
      trusted: true,
    });

    await db.transcript.update({
      where: { id },
      data: { fileId: storedTemplated.id },
    });

    return templated;
  }

  const bytes = await renderTablePdf({
    title: `${school?.name ?? "School"}: Academic Transcript`,
    subtitle: [
      fullName(record.student),
      record.student.admissionNo,
      record.purpose ? `Issued for: ${record.purpose}` : null,
      `Serial ${record.serialNumber}`,
      `Issued ${formatDate(record.issuedAt)}`,
    ]
      .filter(Boolean)
      .join("  ·  "),
    headers,
    rows,
    footer: `Cumulative GPA ${toNumber(record.cumulativeGpa)?.toFixed(2) ?? "-"}${
      record.classification ? ` · ${record.classification}` : ""
    } · Verify at /verify/${record.verifyCode} · This document is void if altered.`,
    crest: await loadDocumentImage(school?.crestUrl || school?.logoUrl),
  });

  const stored = await storeFile({
    buffer: bytes,
    originalName: `${record.serialNumber.replace(/\//g, "-")}.pdf`,
    mimeType: "application/pdf",
    folder: "transcripts",
    uploadedById: options.storedById ?? null,
    trusted: true,
  });

  await db.transcript.update({
    where: { id },
    data: { fileId: stored.id },
  });

  return bytes;
}

/** The filename a credential downloads as. */
export async function credentialFilename(
  kind: "certificate" | "transcript",
  id: string,
): Promise<string> {
  const record =
    kind === "certificate"
      ? await db.issuedCertificate.findUnique({
          where: { id },
          select: { serialNumber: true },
        })
      : await db.transcript.findUnique({
          where: { id },
          select: { serialNumber: true },
        });

  return `${(record?.serialNumber ?? kind).replace(/\//g, "-")}.pdf`;
}
