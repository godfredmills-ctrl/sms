import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

import { StaffForm } from "../staff-form";

export const metadata: Metadata = { title: "Add staff" };
export const dynamic = "force-dynamic";

export default async function NewStaffPage() {
  await requirePermission("staff.create");

  const subjects = await db.subject.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });

  return (
    <>
      <div className="mb-5">
        <Link
          href="/staff"
          className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)]"
        >
          ← Staff
        </Link>
        <PageHeader
          title="Add a staff member"
          description="The record comes first. A login for them is created from their profile afterwards, so the account is linked to the person rather than standing on its own."
        />
      </div>

      <div className="mx-auto max-w-3xl">
        <StaffForm
          subjects={subjects.map((subject) => ({
            value: subject.name,
            label: subject.name,
            description: subject.code,
          }))}
        />
      </div>
    </>
  );
}
