import type { Metadata } from "next";
import Link from "next/link";

import { Alert, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

import { AdmissionForm } from "./admission-form";

export const metadata: Metadata = { title: "Admit a student" };
export const dynamic = "force-dynamic";

export default async function AdmissionsPage() {
  await requirePermission("student.create");

  const [sections, currentYear] = await Promise.all([
    db.classSection.findMany({
      where: { isActive: true },
      orderBy: [{ classLevel: { sequence: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        capacity: true,
        classLevel: { select: { name: true } },
        _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
      },
    }),
    db.academicYear.findFirst({
      where: { isCurrent: true },
      select: { name: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Admit a student"
        description={
          currentYear
            ? `Placement is into ${currentYear.name}.`
            : "No current academic year is set."
        }
        breadcrumb={
          <Link href="/students" className="hover:text-[var(--text)]">
            Students
          </Link>
        }
      />

      {!currentYear ? (
        <Alert tone="warning" className="mb-4">
          No academic year is marked current, so the student can be created but not
          placed in a class. Set one under Academic years first if you want the
          placement to take effect now.
        </Alert>
      ) : null}

      <AdmissionForm
        sections={sections.map((section) => ({
          value: section.id,
          label: `${section.classLevel.name} ${section.name}`,
          // Places left is the number that decides whether this class is the
          // right one, so it belongs on the option rather than a tooltip.
          description: `${section._count.enrollments}/${section.capacity} places used`,
          group: section.classLevel.name,
          disabled: section._count.enrollments >= section.capacity,
        }))}
      />
    </>
  );
}
