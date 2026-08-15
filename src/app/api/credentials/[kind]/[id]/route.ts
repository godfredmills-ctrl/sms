import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { credentialFilename, renderCredentialPdf } from "@/lib/credential-pdf";
import { canAccessCredential } from "@/lib/credentials";
import { db } from "@/lib/db";

/**
 * Downloads a certificate or transcript as a PDF.
 *
 * The rendering itself lives in `credential-pdf.ts`, shared with the email
 * action, so a family cannot receive a document by email that differs from the
 * one they download here.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;

  if (kind !== "certificate" && kind !== "transcript") {
    return NextResponse.json({ error: "Unknown credential type." }, { status: 400 });
  }

  const user = await requireUser();

  // The owning student is read first so access is judged against the document
  // itself rather than a permission alone — that is what lets a family
  // download their own without being granted everyone else's.
  const owner =
    kind === "certificate"
      ? await db.issuedCertificate.findUnique({
          where: { id },
          select: { studentId: true, revokedAt: true },
        })
      : await db.transcript.findUnique({
          where: { id },
          select: { studentId: true, revokedAt: true },
        });

  if (!owner) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = await canAccessCredential(user, kind, owner.studentId);
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }

  // A withdrawn document stays visible to staff — they may need to see what
  // was issued — but is not handed back to the family as if it still stood.
  if (owner.revokedAt && access.via !== "staff") {
    return NextResponse.json(
      { error: "This document has been withdrawn by the school." },
      { status: 410 },
    );
  }

  // Only staff may force a re-render. A family re-downloading must always get
  // the document that was issued to them, not a fresh one off a changed
  // template.
  const regenerate =
    access.via === "staff" &&
    new URL(request.url).searchParams.get("regenerate") === "1";

  try {
    const [bytes, filename] = await Promise.all([
      renderCredentialPdf(kind, id, { regenerate, storedById: user.id }),
      credentialFilename(kind, id),
    ]);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        // Never cached by a shared proxy: these are personal documents.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
