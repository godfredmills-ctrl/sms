import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";

import { StaffForm } from "../../staff-form";

export const metadata: Metadata = { title: "Edit staff" };
export const dynamic = "force-dynamic";

/** Date inputs want yyyy-mm-dd and nothing else. */
const dateValue = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : "";

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
          values={{
            id: staff.id,
            title: staff.title ?? "",
            firstName: staff.firstName,
            lastName: staff.lastName,
            otherNames: staff.otherNames ?? "",
            gender: staff.gender,
            dateOfBirth: dateValue(staff.dateOfBirth),
            photoUrl: staff.photoUrl ?? "",
            email: staff.email ?? "",
            phone: staff.phone ?? "",
            altPhone: staff.altPhone ?? "",
            address: staff.address ?? "",
            digitalAddr: staff.digitalAddr ?? "",
            nationality: staff.nationality ?? "Ghanaian",
            nationalId: staff.nationalId ?? "",
            ssnitNumber: staff.ssnitNumber ?? "",
            tin: staff.tin ?? "",
            jobTitle: staff.jobTitle ?? "",
            department: staff.department ?? "",
            employmentType: staff.employmentType,
            hireDate: dateValue(staff.hireDate),
            isTeaching: staff.isTeaching,
            specialisations: staff.specialisations,
            emergencyName: staff.emergencyName ?? "",
            emergencyPhone: staff.emergencyPhone ?? "",
            emergencyRelation: staff.emergencyRelation ?? "",
            notes: staff.notes ?? "",
          }}
        />
      </div>
    </>
  );
}
