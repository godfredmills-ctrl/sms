import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadDocumentImage } from "@/lib/document-images";
import { categoryLabel } from "@/app/(app)/visitors/categories";
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

function startOfToday(): Date {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return midnight;
}

/**
 * The one place a caller-supplied string reaches HTML.
 *
 * Every sibling route with this helper passes constants; this route is the
 * first to echo a query parameter back, and echoing it raw made the page a
 * reflected-XSS vector on the app's own origin — a link mailed to the front
 * desk could act as the front desk.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function message(status: number, title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#111">
<h1 style="font-size:1.1rem">${escapeHtml(title)}</h1><p style="color:#555;line-height:1.5">${escapeHtml(body)}</p>
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
  const id = url.searchParams.get("id");
  const passNo = url.searchParams.get("pass");
  // Named rather than implied: ?scope=onsite is what the register's button
  // links to, and a parameter the code ignores is a parameter that stops
  // being true the moment someone changes one side of it.
  const scope = url.searchParams.get("scope") ?? "onsite";

  // A pass number is a label, not a key: the desk starts again at 01 every
  // morning, so V-0819-04 names a different person each week. Reprinting from
  // the register therefore asks by row id, and ?pass= — which the desk types
  // off a pass in someone's hand — resolves to the most recent holder of that
  // number, who is the person standing there.
  const where = id
    ? { id }
    : passNo
      ? { badgeNo: passNo }
      : scope === "today"
        ? { signedInAt: { gte: startOfToday() } }
        : { signedOutAt: null };

  const rows = await db.visitor.findMany({
    where,
    orderBy: { signedInAt: "desc" },
    take: id || passNo ? 1 : MAX_PASSES + 1,
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
      id
        ? "That visit is no longer in the register."
        : passNo
          ? `No visit is recorded against pass ${passNo}.`
          : scope === "today"
            ? "Nobody has signed in today."
            : "Nobody is signed in at the moment.",
    );
  }

  if (rows.length > MAX_PASSES) {
    return message(
      400,
      "That is a lot of passes",
      `This would print more than ${MAX_PASSES} passes. Sign out the people who have already left, then try again.`,
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
    category: categoryLabel(row.category),
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

  const single = Boolean(id || passNo);
  const filename = single ? `visitor-pass-${rows[0].badgeNo}.pdf` : "visitor-passes.pdf";

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
