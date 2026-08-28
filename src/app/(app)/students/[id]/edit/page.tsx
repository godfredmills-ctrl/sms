import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { studentOutOfScope } from "@/lib/scope";
import { fullName } from "@/lib/utils";

import { StudentForm } from "./student-form";
import { studentFormValues } from "./values";

export const metadata: Metadata = { title: "Edit student" };
export const dynamic = "force-dynamic";

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("student.update");
  const { id } = await params;

  // The family's circumstances sit behind their own permission on the
  // profile, and an edit form is not a way around a read gate.
  const canSeeBackground = userCan(user, "student.background.read");

  const student = await db.student.findUnique({ where: { id } });
  if (!student) notFound();

  // The same boundary the action enforces. A form teacher opening another
  // class's child by URL gets the refusal here, not after typing into it.
  if (await studentOutOfScope(user, id)) notFound();

  return (
    <>
      <div className="mb-5">
        <Link
          href={`/students/${student.id}`}
          className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)]"
        >
          ← {fullName(student)}
        </Link>
        <PageHeader
          title={`Edit ${fullName(student)}`}
          description={`${student.admissionNo}. Leaving, suspension and a change of class are recorded on the profile, not here.`}
        />
      </div>

      <div className="mx-auto max-w-3xl">
        <StudentForm
          canSeeBackground={canSeeBackground}
          values={studentFormValues(student)}
        />
      </div>
    </>
  );
}
