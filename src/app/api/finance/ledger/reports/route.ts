import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { ledgerReports } from "@/lib/ledger";
import { accountTypeLabel } from "@/lib/ledger-rules";
import { loadLetterhead } from "@/lib/letterhead";
import { formatMoney } from "@/lib/money";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { formatDate } from "@/lib/utils";

/**
 * The trial balance, the income statement and the balance sheet, on one
 * document.
 *
 * They are printed together on purpose. An income statement without the
 * balance sheet beside it invites the question of where the surplus went, and
 * a trial balance is what an auditor uses to check that either of them can be
 * trusted. The same three figures appear on the ledger screen, from the same
 * function, so a bursar comparing the printout with the page cannot find two
 * answers.
 *
 * Rendered on request and never stored: a statement is true as at a moment,
 * and yesterday's copy of it is not this morning's position.
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

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: Request) {
  let user;
  try {
    user = await authorize("finance.ledger.read");
  } catch (error) {
    return message(403, "Not signed in for this", (error as Error).message);
  }

  const url = new URL(request.url);
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));

  const [letterhead, reports] = await Promise.all([
    loadLetterhead(),
    ledgerReports({ from, to }),
  ]);

  if (!letterhead) {
    return message(
      503,
      "The school is not set up yet",
      "Add the school's name and address under Settings before printing on letterhead.",
    );
  }

  const { trial, income, sheet } = reports;

  if (!trial.rows.length) {
    return message(
      404,
      "Nothing to report",
      "No entries have been posted for this period, so there are no statements to produce.",
    );
  }

  const amount = (minor: number) => formatMoney(minor, "GHS", { withSymbol: false });

  const body: string[] = [
    "### Trial balance",
    "",
    "| Code | Account | Debit | Credit |",
    "| --- | --- | --- | --- |",
    ...trial.rows.map(
      (row) =>
        `| ${row.code} | ${row.name} | ${row.side === "DEBIT" ? amount(row.columnMinor) : ""} | ${
          row.side === "CREDIT" ? amount(row.columnMinor) : ""
        } |`,
    ),
    `| | **Totals** | **${amount(trial.debitMinor)}** | **${amount(trial.creditMinor)}** |`,
    "",
  ];

  // Said rather than left to the reader to check. If this line ever reads
  // otherwise, the statements below it are not to be relied on.
  body.push(
    trial.balanced
      ? "The trial balance agrees."
      : `The trial balance is out by ${formatMoney(Math.abs(trial.differenceMinor))}. The statements below should not be relied on until this is found.`,
    "",
    "### Income and expenditure",
    "",
    "| Code | Account | Amount |",
    "| --- | --- | --- |",
    ...income.income.rows.map(
      (row) => `| ${row.code} | ${row.name} | ${amount(row.balanceMinor)} |`,
    ),
    `| | **Total income** | **${amount(income.income.totalMinor)}** |`,
    ...income.expenses.rows.map(
      (row) => `| ${row.code} | ${row.name} | ${amount(row.balanceMinor)} |`,
    ),
    `| | **Total expenditure** | **${amount(income.expenses.totalMinor)}** |`,
    `| | **${income.surplusMinor >= 0 ? "Surplus" : "Deficit"} for the period** | **${amount(Math.abs(income.surplusMinor))}** |`,
    "",
    "### Balance sheet",
    "",
    "| Code | Account | Amount |",
    "| --- | --- | --- |",
    ...sheet.assets.rows.map(
      (row) => `| ${row.code} | ${row.name} | ${amount(row.balanceMinor)} |`,
    ),
    `| | **Total assets** | **${amount(sheet.assetsMinor)}** |`,
    ...sheet.liabilities.rows.map(
      (row) => `| ${row.code} | ${row.name} | ${amount(row.balanceMinor)} |`,
    ),
    ...sheet.equity.rows.map(
      (row) => `| ${row.code} | ${row.name} | ${amount(row.balanceMinor)} |`,
    ),
    `| | ${income.surplusMinor >= 0 ? "Surplus" : "Deficit"} for the period | ${amount(sheet.surplusMinor)} |`,
    `| | **Funded by** | **${amount(sheet.fundedMinor)}** |`,
    "",
    sheet.balanced
      ? "Assets equal what funds them."
      : `The balance sheet is out by ${formatMoney(Math.abs(sheet.differenceMinor))}.`,
    "",
  );

  const actor = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  const period =
    from || to
      ? `${from ? formatDate(from, "long") : "the beginning"} to ${to ? formatDate(to, "long") : "today"}`
      : "everything posted to date";

  const pdf = await renderDocumentPdf({
    letterhead,
    document: {
      title: "Financial statements",
      reference: `As at ${formatDate(new Date(), "long")}`,
      date: formatDate(new Date(), "long"),
      addressee: [],
      salutation: null,
      body: body.join("\n"),
      closing: null,
      signatory: null,
      footnote: `Covering ${period}. Amounts in Ghana cedis. Prepared${actor ? ` by ${actor}` : ""} from posted entries only; drafts affect nothing.`,
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="financial-statements-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
