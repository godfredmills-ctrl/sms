import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { loadLetterhead } from "@/lib/letterhead";
import { voucher } from "@/lib/stock";
import { formatUnits } from "@/lib/stock-rules";
import { formatDate } from "@/lib/utils";

/**
 * The store issue voucher.
 *
 * A school store runs on signed slips. Somebody comes to the store, takes six
 * sacks of rice, and signs for them; when the term's provisions are audited
 * the question is not what the database says but who signed for what. Without
 * the slip the module records an issue that nobody acknowledged, which is
 * exactly the gap a storekeeper gets blamed for.
 *
 * One voucher number covers everything taken in a single trip, so the paper
 * matches the goods that were carried away rather than being one slip per
 * line.
 *
 * Rendered on request and never stored — a voucher is a record of what left
 * the store, and it should read the same in a year as it does today.
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
  { params }: { params: Promise<{ reference: string }> },
) {
  try {
    await authorize("stock.read");
  } catch (error) {
    return message(403, "Not signed in for this", (error as Error).message);
  }

  const { reference } = await params;
  const decoded = decodeURIComponent(reference);

  const [slip, letterhead] = await Promise.all([voucher(decoded), loadLetterhead()]);

  if (!slip) {
    return message(
      404,
      "No such voucher",
      `Nothing was issued under ${decoded}. Check the reference on the movement.`,
    );
  }

  if (!letterhead) {
    return message(
      503,
      "The school is not set up yet",
      "Add the school's name and address under Settings before printing on letterhead.",
    );
  }

  const taker = slip.issuedTo
    ? `${slip.issuedTo.firstName} ${slip.issuedTo.lastName}`
    : null;

  const body: string[] = [
    "| Code | Item | Quantity |",
    "| --- | --- | --- |",
    ...slip.lines.map(
      (line) =>
        `| ${line.code} | ${line.name} | ${formatUnits(line.quantityMilli, line.unit)} |`,
    ),
    "",
  ];

  const notes = slip.lines.map((line) => line.note).filter(Boolean);
  if (notes.length) {
    body.push(`${[...new Set(notes)].join(" ")}`, "");
  }

  body.push(
    "The goods listed above were issued from the school store and received in full.",
    "",
    // Four or more underscores are a line to write on, not emphasis — the
    // shared Markdown parser learned that the hard way, when signature lines
    // on every letter in this system silently became bold text.
    "Issued by: ________________________    Date: ______________",
    "",
    "Received by: ______________________    Date: ______________",
    "",
  );

  const pdf = await renderDocumentPdf({
    letterhead,
    document: {
      title: "Store Issue Voucher",
      reference: slip.reference,
      date: formatDate(slip.occurredOn, "long"),
      addressee: [
        taker ?? "The holder",
        ...(slip.issuedToDept ? [slip.issuedToDept] : []),
      ],
      salutation: null,
      body: body.join("\n"),
      closing: null,
      signatory: null,
      footnote: slip.recordedByLabel
        ? `Entered by ${slip.recordedByLabel}. Queries to the school store.`
        : "Queries to the school store.",
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${slip.reference.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
