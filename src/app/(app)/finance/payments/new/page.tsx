import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

import { RecordPaymentForm, type PayableStudent } from "./payment-form";

export const metadata: Metadata = { title: "Record payment" };
export const dynamic = "force-dynamic";

export default async function RecordPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  await requirePermission("finance.payment.record");
  const { student: initialStudentId } = await searchParams;

  const students = await db.student.findMany({
    where: { status: "ENROLLED" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      enrollments: {
        where: { status: "ACTIVE" },
        take: 1,
        select: {
          classSection: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
        },
      },
      invoices: {
        where: { balanceMinor: { gt: 0 }, status: { notIn: ["DRAFT", "CANCELLED"] } },
        orderBy: { dueDate: "asc" },
        select: { id: true, invoiceNo: true, balanceMinor: true, dueDate: true },
      },
      guardians: {
        where: { isBillPayer: true },
        take: 1,
        select: { guardian: { select: { phone: true } } },
      },
    },
  });

  const rows: PayableStudent[] = students.map((student) => {
    const enrolment = student.enrollments[0];
    const className = enrolment
      ? `${enrolment.classSection.classLevel.name} ${enrolment.classSection.name}`
      : "Unassigned";

    return {
      id: student.id,
      label: `${student.lastName}, ${student.firstName} (${className}) · ${student.admissionNo}`,
      outstandingMinor: student.invoices.reduce(
        (sum, invoice) => sum + invoice.balanceMinor,
        0,
      ),
      invoices: student.invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNo: invoice.invoiceNo,
        balanceMinor: invoice.balanceMinor,
        dueDate: invoice.dueDate?.toISOString() ?? null,
      })),
      guardianPhone: student.guardians[0]?.guardian.phone ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="Record a payment"
        description="For cash, cheque, bank transfer or a mobile money payment taken at the office."
        breadcrumb={
          <>
            <a href="/finance" className="hover:text-[var(--text)]">
              Fees &amp; Billing
            </a>{" "}
            / Record payment
          </>
        }
      />

      <RecordPaymentForm students={rows} initialStudentId={initialStudentId} />
    </>
  );
}
