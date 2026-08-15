import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildReportCardPdf, canAccessReportCard } from "@/lib/report-card-pdf";

/**
 * A report card as a PDF.
 *
 * Rendered on request rather than cached: a report card is expected to change
 * when a mark is corrected and the card re-published, and caching one per
 * student per term would fill storage with objects that are cheap to rebuild.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await requireUser();

  const card = await db.reportCard.findUnique({
    where: { id },
    select: {
      studentId: true,
      status: true,
      student: { select: { admissionNo: true } },
      term: { select: { name: true } },
    },
  });

  if (!card) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = await canAccessReportCard(user, card);
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }

  const bytes = await buildReportCardPdf(id);
  if (!bytes) {
    return NextResponse.json({ error: "Could not render." }, { status: 500 });
  }

  const filename = `${card.student.admissionNo.replace(/\//g, "-")}-${card.term.name
    .toLowerCase()
    .replace(/\s+/g, "-")}.pdf`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      // Personal, and re-rendered on demand — never cached by a shared proxy.
      "Cache-Control": "private, no-store",
    },
  });
}
