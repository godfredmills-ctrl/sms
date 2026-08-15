import type { Metadata } from "next";
import { CalendarCheck, GraduationCap, Home, Phone, Pill } from "lucide-react";

import {
  Alert,
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  PageHeader,
  ProgressBar,
  StatusBadge,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { percentOf } from "@/lib/money";
import {
  calculateAge,
  formatDate,
  formatPercent,
  formatPhone,
  fullName,
  humanise,
} from "@/lib/utils";

import { NotLinked } from "../not-linked";
import { wardsFor } from "../wards";

export const metadata: Metadata = { title: "My Children" };
export const dynamic = "force-dynamic";

export default async function GuardianChildrenPage() {
  const user = await requireUser();
  if (!user.guardianId) return <NotLinked title="My Children" />;

  const links = await wardsFor(user.guardianId);
  if (!links.length) return <NotLinked title="My Children" />;

  const [attendance, medical] = await Promise.all([
    db.attendanceRecord.groupBy({
      by: ["studentId", "status"],
      where: { studentId: { in: links.map((link) => link.student.id) } },
      _count: { _all: true },
    }),
    db.studentMedical.findMany({
      where: { studentId: { in: links.map((link) => link.student.id) } },
      select: {
        studentId: true,
        bloodGroup: true,
        allergies: true,
        conditions: true,
        emergencyInstructions: true,
      },
    }),
  ]);

  const medicalByStudent = new Map(medical.map((entry) => [entry.studentId, entry]));

  return (
    <>
      <PageHeader
        title="My children"
        description="Class placement, form teacher, and the details the school holds."
      />

      <div className="space-y-4">
        {links.map((link) => {
          const student = link.student;
          const section = student.enrollments[0]?.classSection;

          const counts = attendance.filter((row) => row.studentId === student.id);
          const total = counts.reduce((sum, row) => sum + row._count._all, 0);
          const present = counts
            .filter((row) =>
              ["PRESENT", "LATE", "EXCUSED", "HALF_DAY"].includes(row.status),
            )
            .reduce((sum, row) => sum + row._count._all, 0);
          const rate = percentOf(present, total);

          const health = medicalByStudent.get(student.id);
          const allergies =
            (health?.allergies as Array<{ name: string; severity?: string }> | null) ??
            [];
          const conditions =
            (health?.conditions as Array<{ condition?: string }> | null) ?? [];

          return (
            <Card key={student.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2.5">
                    <Avatar
                      name={fullName(student)}
                      src={student.photoUrl}
                      size={36}
                    />
                    {fullName(student)}
                  </span>
                }
                description={`${student.admissionNo} · ${humanise(link.relation)}`}
                action={
                  <>
                    <StatusBadge status={student.status} />
                    {link.isBillPayer ? <Badge tone="warning">Bill payer</Badge> : null}
                  </>
                }
              />

              <CardBody className="space-y-4">
                {allergies.length ? (
                  <Alert tone="danger">
                    <span className="flex items-start gap-2">
                      <Pill className="mt-0.5 size-4 shrink-0" />
                      <span>
                        <strong>Allergies on file:</strong>{" "}
                        {allergies.map((entry) => entry.name).join(", ")}.
                        {health?.emergencyInstructions
                          ? ` ${health.emergencyInstructions}`
                          : ""}
                      </span>
                    </span>
                  </Alert>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <DescriptionList
                    columns={1}
                    items={[
                      {
                        label: "Class",
                        value: section
                          ? `${section.classLevel.name} ${section.name}`
                          : "Not enrolled",
                      },
                      {
                        label: "Form teacher",
                        value: section?.formTeacher ? (
                          <span className="flex flex-wrap items-center gap-2">
                            {fullName(section.formTeacher)}
                            {section.formTeacher.phone ? (
                              <a
                                href={`tel:${section.formTeacher.phone}`}
                                className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
                              >
                                <Phone className="size-3" />
                                {formatPhone(section.formTeacher.phone)}
                              </a>
                            ) : null}
                          </span>
                        ) : (
                          "Not assigned"
                        ),
                      },
                      {
                        label: "Age",
                        value: student.dateOfBirth
                          ? `${calculateAge(student.dateOfBirth)} (born ${formatDate(student.dateOfBirth)})`
                          : "—",
                      },
                      {
                        label: "Residence",
                        value: (
                          <span className="flex items-center gap-1.5">
                            <Home className="size-3.5 text-[var(--text-subtle)]" />
                            {student.isBoarder ? "Boarder" : "Day student"}
                            {student.house ? ` · ${student.house} house` : ""}
                          </span>
                        ),
                      },
                      {
                        label: "Blood group",
                        value: health?.bloodGroup ?? "Not recorded",
                      },
                    ]}
                  />

                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 flex items-baseline justify-between text-xs">
                        <span className="flex items-center gap-1 text-[var(--text-muted)]">
                          <CalendarCheck className="size-3" />
                          Attendance
                        </span>
                        <span className="numeric font-medium">
                          {total ? formatPercent(rate) : "—"}
                        </span>
                      </div>
                      <ProgressBar
                        value={rate}
                        tone={rate >= 92 ? "success" : rate >= 85 ? "warning" : "danger"}
                        label={`Attendance ${rate.toFixed(0)}%`}
                      />
                      <p className="mt-1 text-xs text-[var(--text-subtle)]">
                        {present} of {total} sessions attended
                      </p>
                    </div>

                    {conditions.length ? (
                      <div>
                        <p className="text-xs font-medium text-[var(--text-muted)]">
                          Medical conditions
                        </p>
                        <p className="text-sm">
                          {conditions
                            .map((entry) => entry.condition)
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </div>
                    ) : null}

                    <p className="text-xs text-[var(--text-subtle)]">
                      <GraduationCap className="mr-1 inline size-3" />
                      Contact the office to correct anything shown here — the school
                      record is the one used in an emergency.
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
