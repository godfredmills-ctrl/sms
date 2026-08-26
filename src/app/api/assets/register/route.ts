import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { conditionLabel, statusLabel } from "@/lib/asset-rules";
import { register, registerSummary } from "@/lib/assets";
import { loadLetterhead } from "@/lib/letterhead";
import { formatMoney } from "@/lib/money";
import { renderReportPdf } from "@/lib/report-pdf";
import { formatDate } from "@/lib/utils";

/**
 * The asset register, printed.
 *
 * The document an auditor asks for by name, an insurer wants a copy of, and a
 * governing board reads once a year. It is deliberately the same numbers as
 * the screen — the register page and this route both call `registerSummary`,
 * so a bursar comparing the printout with the page cannot find two answers and
 * have no way of telling which is the school's.
 *
 * Rendered on request and never stored: an asset disposed of on Monday must
 * not still be listed as held on Tuesday's copy.
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
  let user;
  try {
    user = await authorize("asset.read");
  } catch (error) {
    return message(403, "Not signed in for this", (error as Error).message);
  }

  const url = new URL(request.url);
  const filter = {
    categoryId: url.searchParams.get("category") ?? undefined,
    locationId: url.searchParams.get("location") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    search: url.searchParams.get("q") ?? undefined,
  };

  const asOf = new Date();

  const [letterhead, summary, listing] = await Promise.all([
    loadLetterhead(),
    registerSummary(filter, asOf),
    // The whole register, not a page of it. A printed register that stopped at
    // fifty rows would be worse than none: it looks complete.
    register(filter, asOf, { take: 5_000 }),
  ]);

  if (!letterhead) {
    return message(
      503,
      "The school is not set up yet",
      "Add the school's name and address under Settings before printing on letterhead.",
    );
  }

  const { rows } = listing;
  const { totals } = summary;

  if (!rows.length) {
    return message(
      404,
      "Nothing to print",
      "No assets match those filters, so there is no register to produce.",
    );
  }

  const actor = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  const pdf = await renderReportPdf({
    letterhead,
    report: {
      title: "Asset register",
      subtitle: `${totals.heldCount} held · ${formatMoney(totals.costMinor)} at cost · ${formatMoney(totals.netBookMinor)} written down`,
      meta: `As at ${formatDate(asOf, "long")}${actor ? ` · prepared by ${actor}` : ""}`,
      columns: [
        { key: "tag", label: "Tag" },
        { key: "name", label: "Asset" },
        { key: "category", label: "Category" },
        { key: "location", label: "Where" },
        { key: "custodian", label: "Held by" },
        { key: "state", label: "State" },
        { key: "purchased", label: "Bought" },
        // The currency lives in the heading, not in every cell.
        //
        // With ten columns each cell has 67pt, and "GHS 1,200,000.00" needs
        // 66.3 of them — so a school whose land runs to eight figures gained
        // one digit and had it silently clipped. A truncated figure on a
        // register is worse than a missing one: it reads as a number, and an
        // auditor reconciles against it. scripts/check-register-fit.mjs keeps
        // it honest.
        { key: "cost", label: "Cost (GHS)", numeric: true },
        { key: "depreciation", label: "Depreciated (GHS)", numeric: true },
        // "Net book" rather than the screen's "Written down to": it is the term
        // on every register an auditor has ever read, and it is the one that
        // fits the column. The figure is identical.
        { key: "value", label: "Net book (GHS)", numeric: true },
      ],
      rows: rows.map((row) => ({
        tag: row.tag,
        name: row.name,
        category: row.categoryName,
        location: row.locationName ?? "-",
        custodian: row.custodianName ?? "-",
        state: `${statusLabel(row.status)} · ${conditionLabel(row.condition)}`,
        purchased: row.purchasedOn ? formatDate(row.purchasedOn) : "-",
        cost: formatMoney(row.costMinor, "GHS", { withSymbol: false }),
        depreciation: row.notDepreciated
          ? "not depreciated"
          : formatMoney(row.accumulatedMinor, "GHS", { withSymbol: false }),
        value:
          row.status === "DISPOSED"
            ? "disposed"
            : formatMoney(row.netBookMinor, "GHS", { withSymbol: false }),
      })),
      // Stated rather than left for the reader to add up, and worded so the
      // basis of the valuation is on the same page as the figures — an auditor
      // reading a net book value needs to know how it was arrived at.
      footerNote: [
        `Held: ${totals.heldCount}. Disposed of: ${totals.disposedCount}. Cannot be found: ${totals.missingCount}.`,
        `At cost ${formatMoney(totals.costMinor)}, less depreciation ${formatMoney(totals.accumulatedMinor)}, written down to ${formatMoney(totals.netBookMinor)}.`,
        totals.disposalGainMinor !== 0
          ? `${totals.disposalGainMinor >= 0 ? "Gain" : "Loss"} on disposals: ${formatMoney(Math.abs(totals.disposalGainMinor))}.`
          : null,
        "Depreciation is straight line, charged monthly from the date of purchase and never taken below residual value. Items with no useful life set are carried at cost.",
      ]
        .filter(Boolean)
        .join(" "),
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="asset-register-${asOf.toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
