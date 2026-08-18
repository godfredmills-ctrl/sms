-- Payroll: compensation on Staff, monthly runs, frozen payslips.

ALTER TABLE "Staff" ADD COLUMN "basicSalaryMinor" INTEGER;
ALTER TABLE "Staff" ADD COLUMN "salaryAllowances" JSONB;

CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "staffNo" TEXT NOT NULL,
    "basicMinor" INTEGER NOT NULL,
    "allowances" JSONB,
    "grossMinor" INTEGER NOT NULL,
    "ssnitEmployeeMinor" INTEGER NOT NULL,
    "ssnitEmployerMinor" INTEGER NOT NULL,
    "payeMinor" INTEGER NOT NULL,
    "otherDeductions" JSONB,
    "netMinor" INTEGER NOT NULL,
    "paymentMethod" TEXT,
    "paymentRef" TEXT,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollRun_year_month_key" ON "PayrollRun"("year", "month");
CREATE UNIQUE INDEX "Payslip_runId_staffId_key" ON "Payslip"("runId", "staffId");
CREATE INDEX "Payslip_staffId_idx" ON "Payslip"("staffId");

ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
