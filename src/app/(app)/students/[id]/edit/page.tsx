import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { studentOutOfScope } from "@/lib/scope";
import { fullName } from "@/lib/utils";

import { StudentForm } from "./student-form";

export const metadata: Metadata = { title: "Edit student" };
export const dynamic = "force-dynamic";

/**
 * Date inputs want yyyy-mm-dd and nothing else — read back in the same
 * timezone the action writes in. toISOString() would read UTC against a
 * value stored at local midnight, and a date of birth would walk one day
 * backwards on every save.
 */
const dateValue = (value: Date | null) => {
  if (!value) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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
          values={{
            id: student.id,
            admissionNo: student.admissionNo,
            indexNumber: student.indexNumber ?? "",
            firstName: student.firstName,
            lastName: student.lastName,
            otherNames: student.otherNames ?? "",
            preferredName: student.preferredName ?? "",
            gender: student.gender,
            dateOfBirth: dateValue(student.dateOfBirth),
            placeOfBirth: student.placeOfBirth ?? "",
            photoUrl: student.photoUrl ?? "",
            nationality: student.nationality ?? "Ghanaian",
            nationalId: student.nationalId ?? "",
            birthCertNo: student.birthCertNo ?? "",
            nhisNumber: student.nhisNumber ?? "",
            religion: student.religion ?? "",
            hometown: student.hometown ?? "",
            homeRegion: student.homeRegion ?? "",
            firstLanguage: student.firstLanguage ?? "English",
            email: student.email ?? "",
            phone: student.phone ?? "",
            residentialAddress: student.residentialAddress ?? "",
            digitalAddr: student.digitalAddr ?? "",
            city: student.city ?? "",
            region: student.region ?? "",
            livingWith: student.livingWith ?? "",
            transportMode: student.transportMode ?? "",
            busRoute: student.busRoute ?? "",
            isBoarder: student.isBoarder,
            house: student.house ?? "",
            dormitory: student.dormitory ?? "",
            roomNumber: student.roomNumber ?? "",
            hasSpecialNeeds: student.hasSpecialNeeds,
            specialNeedsNotes: student.specialNeedsNotes ?? "",
            learningSupport: student.learningSupport,
            onScholarship: student.onScholarship,
            scholarshipDetails: student.scholarshipDetails ?? "",
            notes: student.notes ?? "",
          }}
        />
      </div>
    </>
  );
}
