import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { buildStatement, resolvePeriod, statementMarkdown } from "@/lib/expenses";
import { loadLetterhead } from "@/lib/letterhead";
import { formatDate } from "@/lib/utils";

/**
 * The income and expenditure statement, printed on the school letterhead.
 *
 * `?term=<id>`, or the current term when none is given — the same
 * resolvePeriod the page uses, so the sheet handed round a board meeting
 * cannot cover a different period from the screen it was printed off.
 *
 * Rendered on request and never stored. A bill approved this morning belongs
 * in this afternoon's figures, and a stored statement would quietly be the
 * one from before it.
 */
export const dynamic = "force-dynamic";

function message(status: number, title: string, body: string) {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#111">
<h1 style="font-size:1.1rem">${escape(title)}</h1><p style="color:#555;line-height:1.5">${escape(body)}</p>
</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  // finance.report, not finance.read. finance.read is held by anyone who sees
  // a figure on a dashboard; this is the whole school's income and its whole
  // payroll cost on one sheet.
  let user;
  try {
    user = await authorize("finance.report");
  } catch (error) {
    return message(403, "Not signed in for this", (error as Error).message);
  }

  const url = new URL(request.url);
  const period = await resolvePeriod(url.searchParams.get("term") ?? "");

  const [statement, letterhead] = await Promise.all([
    buildStatement(period),
    loadLetterhead(),
  ]);

  if (!letterhead) {
    return message(
      503,
      "The school is not set up yet",
      "Add the school's name and address under Settings before printing on letterhead.",
    );
  }

  const signatory = user.staffId
    ? await db.staff.findUnique({
        where: { id: user.staffId },
        select: { firstName: true, lastName: true, jobTitle: true },
      })
    : null;

  const pdf = await renderDocumentPdf({
    letterhead,
    document: {
      title: `Income and Expenditure — ${statement.period.label}`,
      date: formatDate(new Date(), "long"),
      body: statementMarkdown(statement),
      closing: "Prepared by,",
      signatory: signatory
        ? {
            name: `${signatory.firstName} ${signatory.lastName}`,
            title: signatory.jobTitle ?? "",
          }
        : null,
      footnote: `Printed ${formatDate(new Date(), "long")} from the school management system. Figures move as bills are approved and paid.`,
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="statement-${statement.period.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
