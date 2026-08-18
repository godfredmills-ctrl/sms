import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";

import { StudentForm } from "./student-form";

export const metadata: Metadata = { title: "Edit student" };
export const dynamic = "force-dynamic";

/** Date inputs want yyyy-mm-dd and nothing else. */
const dateValue = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : "";

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("student.update");
  const { id } = await params;

  const student = await db.student.findUnique({ where: { id } });
  if (!student) notFound();

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
