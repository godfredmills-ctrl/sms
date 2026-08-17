import type { Metadata } from "next";
import Link from "next/link";

import { Alert, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { DOCUMENT_CATEGORIES } from "@/lib/person-documents";
import { db } from "@/lib/db";

import { AdmissionForm, type AdmissionInitial } from "./admission-form";

export const metadata: Metadata = { title: "Admit a student" };
export const dynamic = "force-dynamic";

const GENDER_MAP: Record<string, string> = {
  Female: "FEMALE",
  Male: "MALE",
  "Prefer not to say": "UNDISCLOSED",
};

export default async function AdmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  await requirePermission("student.create");
  const { from } = await searchParams;

  // "Admit this child" on a website application lands here with its id, and
  // the parent's answers arrive already typed in. A family should not answer
  // the same questions twice because the second answering happens at a
  // different desk.
  let initial: AdmissionInitial = {};
  if (from) {
    const submission = await db.siteFormSubmission.findFirst({
      where: { id: from, formKey: "admissions-enquiry" },
      select: { data: true },
    });
    const data = (submission?.data ?? {}) as Record<string, string | null>;

    // "Ama Serwaa Boateng" → first "Ama", others "Serwaa", last "Boateng".
    const childParts = (data.childName ?? "").trim().split(/\s+/).filter(Boolean);
    const parentParts = (data.parentName ?? "").trim().split(/\s+/).filter(Boolean);

    initial = {
      firstName: childParts[0],
      lastName: childParts.length > 1 ? childParts[childParts.length - 1] : undefined,
      otherNames:
        childParts.length > 2 ? childParts.slice(1, -1).join(" ") : undefined,
      gender: GENDER_MAP[data.childGender ?? ""],
      dateOfBirth: data.childDateOfBirth ?? undefined,
      guardianFirstName: parentParts[0],
      guardianLastName:
        parentParts.length > 1 ? parentParts.slice(1).join(" ") : undefined,
      guardianPhone: data.phone ?? undefined,
      guardianEmail: data.email ?? undefined,
      // A website application starts as an applicant: the pipeline exists so
      // that filling a form on the internet puts nobody on a class roll.
      status: "APPLICANT",
    };
  }

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
        documentCategories={DOCUMENT_CATEGORIES.student}
        initial={initial}
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
