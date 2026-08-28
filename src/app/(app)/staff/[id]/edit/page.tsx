import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";

import { StaffForm } from "../../staff-form";
import { staffFormValues } from "../../values";

export const metadata: Metadata = { title: "Edit staff" };
export const dynamic = "force-dynamic";

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("staff.update");
  const { id } = await params;

  const [staff, subjects] = await Promise.all([
    db.staff.findUnique({ where: { id } }),
    db.subject.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);

  if (!staff) notFound();

  return (
    <>
      <div className="mb-5">
        <Link
          href={`/staff/${staff.id}`}
          className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)]"
        >
          ← {fullName(staff)}
        </Link>
        <PageHeader
          title={`Edit ${fullName(staff)}`}
          description={`Staff number ${staff.staffNo}. Employment status and leaving are recorded on the profile, not here.`}
        />
      </div>

      <div className="mx-auto max-w-3xl">
        <StaffForm
          subjects={subjects.map((subject) => ({
            value: subject.name,
            label: subject.name,
            description: subject.code,
          }))}
          values={staffFormValues(staff)}
        />
      </div>
    </>
  );
}
