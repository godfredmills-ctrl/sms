import type { Metadata } from "next";
import { IdCard, Printer, Users } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { listName } from "@/lib/utils";

export const metadata: Metadata = { title: "ID cards" };
export const dynamic = "force-dynamic";

/**
 * Identity-card printing.
 *
 * Cards are generated as a PDF a class at a time — four to an A4 sheet at
 * true card size, front and back side by side — because that is how the
 * school office actually prints them: onto card stock in September, and one
 * replacement at a time when a card goes through the wash. The forms are
 * plain GET forms opening in a new tab; the PDF route re-checks the
 * permission and the picker here is a convenience, not the gate.
 */
export default async function IdCardsPage() {
  const user = await requirePermission(["student.read", "staff.read"]);
  const canStudents = userCan(user, "student.read");
  const canStaff = userCan(user, "staff.read");

  const [sections, students, staff] = await Promise.all([
    canStudents
      ? db.classSection.findMany({
          where: { isActive: true },
          orderBy: [{ classLevel: { sequence: "asc" } }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            classLevel: { select: { name: true } },
            _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
          },
        })
      : Promise.resolve([]),
    canStudents
      ? db.student.findMany({
          where: { status: "ENROLLED" },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: 1500,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            otherNames: true,
            admissionNo: true,
          },
        })
      : Promise.resolve([]),
    canStaff
      ? db.staff.findMany({
          where: { status: "ACTIVE" },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            otherNames: true,
            staffNo: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="ID cards"
        description="Printable identity cards — four people to an A4 sheet at true card size, fronts and backs side by side."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {canStudents ? (
          <Card>
            <CardHeader
              title="Student cards"
              description="A class at a time, or one replacement card."
            />
            <CardBody className="space-y-4">
              <form method="get" action="/api/id-cards" target="_blank" className="space-y-3">
                <input type="hidden" name="kind" value="student" />
                <Field label="Class" htmlFor="idcard-section" required>
                  <SearchableSelect
                    id="idcard-section"
                    name="sectionId"
                    options={sections.map((section) => ({
                      value: section.id,
                      label: `${section.classLevel.name} ${section.name}`,
                      description: `${section._count.enrollments} students`,
                    }))}
                    required
                  />
                </Field>
                <Button type="submit" className="w-full">
                  <Printer className="size-4" />
                  Generate class cards
                </Button>
              </form>

              <form
                method="get"
                action="/api/id-cards"
                target="_blank"
                className="space-y-3 border-t border-[var(--border)] pt-4"
              >
                <input type="hidden" name="kind" value="student" />
                <Field label="Single student" htmlFor="idcard-student">
                  <SearchableSelect
                    id="idcard-student"
                    name="studentId"
                    options={students.map((student) => ({
                      value: student.id,
                      label: listName(student),
                      description: student.admissionNo,
                    }))}
                    searchPlaceholder="Name or admission number…"
                    required
                  />
                </Field>
                <Button type="submit" variant="outline" className="w-full">
                  <IdCard className="size-4" />
                  Generate one card
                </Button>
              </form>
            </CardBody>
          </Card>
        ) : null}

        {canStaff ? (
          <Card>
            <CardHeader
              title="Staff cards"
              description="Everyone active, or one person."
            />
            <CardBody className="space-y-4">
              <LinkButton
                href="/api/id-cards?kind=staff"
                target="_blank"
                className="w-full"
              >
                <Users className="size-4" />
                Generate all staff cards
              </LinkButton>

              <form
                method="get"
                action="/api/id-cards"
                target="_blank"
                className="space-y-3 border-t border-[var(--border)] pt-4"
              >
                <input type="hidden" name="kind" value="staff" />
                <Field label="Single staff member" htmlFor="idcard-staff">
                  <SearchableSelect
                    id="idcard-staff"
                    name="staffId"
                    options={staff.map((member) => ({
                      value: member.id,
                      label: listName(member),
                      description: member.staffNo,
                    }))}
                    required
                  />
                </Field>
                <Button type="submit" variant="outline" className="w-full">
                  <IdCard className="size-4" />
                  Generate one card
                </Button>
              </form>

              <p className="text-xs text-[var(--text-subtle)]">
                Print at 100% scale on card stock. Each card is standard CR80 size
                (85.6 × 54 mm) with a rounded cutting border, and the QR code
                carries the ID number.
              </p>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
