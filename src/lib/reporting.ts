import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

/**
 * The custom report engine — the half that is safe in a browser bundle.
 *
 * Reports are declarative: a dataset plus a list of column keys plus filters.
 * The alternative — letting users write SQL — would be more powerful and would
 * hand anyone with report access the ability to read every table in the
 * database, so the datasets below are the whole surface area on purpose.
 *
 * The queries live in `reporting-data.ts` so that importing a field label into
 * a client component cannot drag Prisma along with it.
 */

export type FieldType = "text" | "number" | "money" | "percent" | "date" | "tag";

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  /** Offered as a filter in the builder. */
  filterable?: boolean;
};

export type DatasetKey =
  | "students"
  | "staff"
  | "attendance"
  | "grades"
  | "finance"
  | "payments"
  | "elections";

export type Dataset = {
  key: DatasetKey;
  label: string;
  description: string;
  /** Permission required to run it. */
  permission: string;
  fields: Field[];
};

export const DATASETS: Dataset[] = [
  {
    key: "students",
    label: "Students",
    description: "Enrolment, demographics, guardians and balances.",
    permission: "student.read",
    fields: [
      { key: "admissionNo", label: "Admission no.", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "gender", label: "Gender", type: "tag", filterable: true },
      { key: "status", label: "Status", type: "tag", filterable: true },
      { key: "className", label: "Class", type: "tag", filterable: true },
      { key: "classLevel", label: "Level", type: "tag", filterable: true },
      { key: "house", label: "House", type: "tag", filterable: true },
      { key: "boarding", label: "Boarding", type: "tag", filterable: true },
      { key: "nationality", label: "Nationality", type: "tag", filterable: true },
      { key: "dateOfBirth", label: "Date of birth", type: "date" },
      { key: "admissionDate", label: "Admitted", type: "date" },
      { key: "guardianName", label: "Primary guardian", type: "text" },
      { key: "guardianPhone", label: "Guardian phone", type: "text" },
      { key: "outstanding", label: "Fees outstanding", type: "money" },
      { key: "attendanceRate", label: "Attendance", type: "percent" },
    ],
  },
  {
    key: "staff",
    label: "Staff",
    description: "Employment, department and teaching load.",
    permission: "staff.read",
    fields: [
      { key: "staffNo", label: "Staff no.", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "jobTitle", label: "Job title", type: "text" },
      { key: "department", label: "Department", type: "tag", filterable: true },
      { key: "employmentType", label: "Contract", type: "tag", filterable: true },
      { key: "status", label: "Status", type: "tag", filterable: true },
      { key: "isTeaching", label: "Teaching", type: "tag", filterable: true },
      { key: "classesTaught", label: "Classes", type: "number" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "hireDate", label: "Hired", type: "date" },
    ],
  },
  {
    key: "attendance",
    label: "Attendance",
    description: "Per-student attendance against every register.",
    permission: "attendance.read",
    fields: [
      { key: "admissionNo", label: "Admission no.", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "className", label: "Class", type: "tag", filterable: true },
      { key: "sessions", label: "Sessions", type: "number" },
      { key: "present", label: "Present", type: "number" },
      { key: "absent", label: "Absent", type: "number" },
      { key: "late", label: "Late", type: "number" },
      { key: "rate", label: "Attendance rate", type: "percent" },
    ],
  },
  {
    key: "grades",
    label: "Grades",
    description: "Published report card lines, subject by subject.",
    permission: "assessment.read",
    fields: [
      { key: "admissionNo", label: "Admission no.", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "className", label: "Class", type: "tag", filterable: true },
      { key: "term", label: "Term", type: "tag", filterable: true },
      { key: "subject", label: "Subject", type: "tag", filterable: true },
      { key: "caScore", label: "CA", type: "number" },
      { key: "examScore", label: "Exam", type: "number" },
      { key: "totalScore", label: "Total", type: "number" },
      { key: "grade", label: "Grade", type: "tag", filterable: true },
      { key: "classAverage", label: "Class average", type: "number" },
      { key: "position", label: "Position", type: "number" },
    ],
  },
  {
    key: "finance",
    label: "Invoices",
    description: "Every bill raised, with what has been paid against it.",
    permission: "finance.read",
    fields: [
      { key: "invoiceNo", label: "Invoice", type: "text" },
      { key: "name", label: "Student", type: "text" },
      { key: "admissionNo", label: "Admission no.", type: "text" },
      { key: "className", label: "Class", type: "tag", filterable: true },
      { key: "term", label: "Term", type: "tag", filterable: true },
      { key: "status", label: "Status", type: "tag", filterable: true },
      { key: "total", label: "Total", type: "money" },
      { key: "paid", label: "Paid", type: "money" },
      { key: "balance", label: "Balance", type: "money" },
      { key: "dueDate", label: "Due", type: "date" },
      { key: "daysOverdue", label: "Days overdue", type: "number" },
    ],
  },
  {
    key: "payments",
    label: "Payments",
    description: "Receipts issued, by channel and provider.",
    permission: "finance.read",
    fields: [
      { key: "receiptNo", label: "Receipt", type: "text" },
      { key: "name", label: "Student", type: "text" },
      { key: "className", label: "Class", type: "tag", filterable: true },
      { key: "amount", label: "Amount", type: "money" },
      { key: "channel", label: "Channel", type: "tag", filterable: true },
      { key: "provider", label: "Provider", type: "tag", filterable: true },
      { key: "status", label: "Status", type: "tag", filterable: true },
      { key: "payerName", label: "Paid by", type: "text" },
      { key: "paidAt", label: "Date", type: "date" },
    ],
  },
  {
    key: "elections",
    label: "Elections",
    description: "Candidates and their results.",
    permission: "election.read",
    fields: [
      { key: "election", label: "Election", type: "tag", filterable: true },
      { key: "position", label: "Position", type: "tag", filterable: true },
      { key: "candidate", label: "Candidate", type: "text" },
      { key: "status", label: "Status", type: "tag", filterable: true },
      { key: "votes", label: "Votes", type: "number" },
      { key: "share", label: "Share", type: "percent" },
    ],
  },
];

export function datasetFor(key: string): Dataset | undefined {
  return DATASETS.find((dataset) => dataset.key === key);
}

export type ReportRow = Record<string, string | number | null>;

export type ReportConfig = {
  columns: string[];
  filters: Record<string, string[]>;
  sort?: { key: string; direction: "asc" | "desc" };
  limit?: number;
};

export function applyConfig(
  rows: ReportRow[],
  dataset: Dataset,
  config: ReportConfig,
): ReportRow[] {
  const columns = config.columns.length
    ? config.columns
    : dataset.fields.slice(0, 6).map((field) => field.key);

  let result = rows;

  for (const [key, values] of Object.entries(config.filters ?? {})) {
    if (!values?.length) continue;
    result = result.filter((row) => values.includes(String(row[key] ?? "")));
  }

  if (config.sort) {
    const { key, direction } = config.sort;
    result = [...result].sort((a, b) => {
      const left = a[key];
      const right = b[key];
      // Nulls sort last whichever way the column is pointed — an empty cell is
      // never the most interesting row.
      if (left === null || left === undefined) return 1;
      if (right === null || right === undefined) return -1;
      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return direction === "desc" ? -comparison : comparison;
    });
  }

  const limited = config.limit ? result.slice(0, config.limit) : result;

  return limited.map((row) =>
    Object.fromEntries(columns.map((key) => [key, row[key] ?? null])),
  );
}

/** Formats a value for display, honouring the field's declared type. */
export function formatCell(value: string | number | null, type: FieldType): string {
  if (value === null || value === undefined || value === "") return "-";

  switch (type) {
    case "money":
      return formatMoney(Number(value));
    case "percent":
      return `${Number(value).toFixed(1)}%`;
    case "date":
      return formatDate(String(value));
    case "number":
      return typeof value === "number" ? value.toLocaleString() : String(value);
    default:
      return String(value);
  }
}
