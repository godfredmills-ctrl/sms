import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { loadLetterhead } from "@/lib/letterhead";
import { formatDate } from "@/lib/utils";

/**
 * A written document, on the school's letterhead.
 *
 * Rendered on request rather than stored, so a draft edited five minutes ago
 * prints as it now reads. A draft carries a watermark on every page: a school
 * that circulates an unfinished proposal should be unable to do it by
 * accident, and the mark is the one thing that survives a photocopy.
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await authorize("letter.read");
  } catch (error) {
    return message(403, "Not signed in for this", (error as Error).message);
  }

  const { id } = await params;

  const [document, letterhead] = await Promise.all([
    db.writtenDocument.findUnique({
      where: { id },
      select: {
        kind: true,
        reference: true,
        title: true,
        body: true,
        recipient: true,
        salutation: true,
        closing: true,
        signatoryName: true,
        signatoryTitle: true,
        footnote: true,
        status: true,
        finalisedAt: true,
        createdAt: true,
      },
    }),
    loadLetterhead(),
  ]);

  if (!document) return message(404, "Not found", "No document has that id.");
  if (!letterhead) {
    return message(
      503,
      "The school is not set up yet",
      "Add the school's name and address under Settings before printing on letterhead.",
    );
  }

  const pdf = await renderDocumentPdf({
    letterhead,
    document: {
      title: document.title,
      reference: document.reference,
      // A final document is dated when it was issued; a draft as of today,
      // because that is when the sheet in somebody's hand was printed.
      date: formatDate(document.finalisedAt ?? new Date(), "long"),
      addressee: document.recipient,
      salutation: document.salutation,
      body: document.body,
      closing: document.closing,
      signatory: document.signatoryName
        ? { name: document.signatoryName, title: document.signatoryTitle ?? "" }
        : null,
      footnote: document.footnote,
      watermark: document.status === "FINAL" ? null : "Draft",
    },
  });

  const slug = document.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${slug || "document"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
