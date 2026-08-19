import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadDocumentImage } from "@/lib/document-images";
import { listName } from "@/lib/utils";
import { renderVisitorPassesPdf, type VisitorPass } from "@/lib/visitor-pass-pdf";

/**
 * Temporary visitor passes as a printable PDF.
 *
 * `?pass=V-0819-04` prints the one just issued at the desk; `?scope=onsite`
 * reprints everyone currently in the building, which is what a desk needs
 * after a printer jam or when the passes come back mixed up.
 *
 * Rendered on request, never stored: a pass is valid for one day, and a
 * stored file would outlive the visit it belongs to.
 */
export const dynamic = "force-dynamic";

/** Far above any real morning, and a stop on a mistyped query. */
const MAX_PASSES = 100;

function message(status: number, title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#111">
<h1 style="font-size:1.1rem">${title}</h1><p style="color:#555;line-height:1.5">${body}</p>
</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  try {
    await authorize("visitor.read");
  } catch (error) {
    return message(403, "Not signed in for this", (error as Error).message);
  }

  const url = new URL(request.url);
  const passNo = url.searchParams.get("pass");

  // A pass number is a label rather than a key — the desk reissues them each
  // morning — so an old day's number can match more than one row. The most
  // recent is the one someone is holding.
  const rows = await db.visitor.findMany({
    where: passNo ? { badgeNo: passNo } : { signedOutAt: null },
    orderBy: { signedInAt: "desc" },
    take: passNo ? 1 : MAX_PASSES + 1,
    select: {
      fullName: true,
      organisation: true,
      category: true,
      badgeNo: true,
      signedInAt: true,
      hostStaff: { select: { firstName: true, lastName: true } },
    },
  });

  if (rows.length === 0) {
    return message(
      404,
      "Nothing to print",
      passNo
        ? `No visit is recorded against pass ${passNo}.`
        : "Nobody is signed in at the moment.",
    );
  }

  if (rows.length > MAX_PASSES) {
    return message(
      400,
      "That is a lot of passes",
      `This would print ${rows.length} passes. Sign out the people who have already left, then try again.`,
    );
  }

  const school = await db.school.findFirst({
    select: {
      name: true,
      addressLine1: true,
      city: true,
      phone: true,
      logoUrl: true,
      crestUrl: true,
    },
  });

  const crest = await loadDocumentImage(school?.crestUrl ?? school?.logoUrl ?? null);

  const passes: VisitorPass[] = rows.map((row) => ({
    passNo: row.badgeNo,
    name: row.fullName,
    organisation: row.organisation,
    category: humaniseCategory(row.category),
    host: row.hostStaff ? listName(row.hostStaff) : null,
    signedInAt: row.signedInAt,
  }));

  const pdf = await renderVisitorPassesPdf({
    school: {
      name: school?.name ?? "School",
      address: [school?.addressLine1, school?.city].filter(Boolean).join(", ") || null,
      phone: school?.phone ?? null,
    },
    crest,
    passes,
  });

  const filename = passNo ? `visitor-pass-${passNo}.pdf` : "visitor-passes.pdf";

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** PARENT -> "Parent", INSPECTOR -> "Inspector". */
function humaniseCategory(value: string): string {
  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
