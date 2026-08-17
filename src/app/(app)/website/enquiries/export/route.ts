import { NextResponse } from "next/server";

import { getCurrentUser, userCan } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** A cell that cannot start a formula when the file opens in Excel. */
function csvCell(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * The newsletter list as a CSV download.
 *
 * The copy box on the Newsletter tab covers pasting into a BCC field; a
 * school moving to a real mail tool wants the file. Same permission as the
 * page that links here.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !userCan(user, "student.create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db.siteFormSubmission.findMany({
    where: { formKey: "newsletter", isSpam: false },
    orderBy: { createdAt: "desc" },
    select: { data: true, createdAt: true },
    take: 10_000,
  });

  const lines = [
    "email,subscribed_at",
    ...rows.flatMap((row) => {
      const email = String((row.data as { email?: string })?.email ?? "");
      if (!email) return [];
      return [
        `${csvCell(email)},${csvCell(row.createdAt.toISOString().slice(0, 10))}`,
      ];
    }),
  ];

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="newsletter-subscribers.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
