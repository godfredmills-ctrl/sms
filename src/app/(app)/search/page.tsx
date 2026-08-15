import type { Metadata } from "next";
import Link from "next/link";
import {
  FileText,
  FolderOpen,
  GraduationCap,
  Receipt,
  Search as SearchIcon,
  Users,
} from "lucide-react";

import {
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
} from "@/components/ui";
import { requireUser, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate, fullName, formatPhone } from "@/lib/utils";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const canReadStudents = userCan(user, "student.read");
  const canReadStaff = userCan(user, "staff.read");
  const canReadFinance = userCan(user, "finance.read");
  const canReadDocuments = userCan(user, "document.read");

  // Each branch is gated on its own permission rather than a single "search"
  // permission. A search box that returns records the user cannot open is a
  // information leak with extra steps.
  const [students, staff, invoices, documents] = query
    ? await Promise.all([
        canReadStudents
          ? db.student.findMany({
              where: {
                OR: [
                  { firstName: { contains: query, mode: "insensitive" } },
                  { lastName: { contains: query, mode: "insensitive" } },
                  { otherNames: { contains: query, mode: "insensitive" } },
                  { admissionNo: { contains: query, mode: "insensitive" } },
                  { phone: { contains: query } },
                  { email: { contains: query, mode: "insensitive" } },
                ],
              },
              take: 15,
              select: {
                id: true,
                firstName: true,
                lastName: true,
                otherNames: true,
                admissionNo: true,
                photoUrl: true,
                status: true,
                enrollments: {
                  where: { status: "ACTIVE" },
                  take: 1,
                  select: {
                    classSection: {
                      select: { name: true, classLevel: { select: { name: true } } },
                    },
                  },
                },
              },
            })
          : Promise.resolve([]),
        canReadStaff
          ? db.staff.findMany({
              where: {
                OR: [
                  { firstName: { contains: query, mode: "insensitive" } },
                  { lastName: { contains: query, mode: "insensitive" } },
                  { staffNo: { contains: query, mode: "insensitive" } },
                  { email: { contains: query, mode: "insensitive" } },
                  { phone: { contains: query } },
                ],
              },
              take: 10,
              select: {
                id: true,
                firstName: true,
                lastName: true,
                otherNames: true,
                title: true,
                staffNo: true,
                jobTitle: true,
                department: true,
                photoUrl: true,
                phone: true,
              },
            })
          : Promise.resolve([]),
        canReadFinance
          ? db.invoice.findMany({
              where: {
                OR: [
                  { invoiceNo: { contains: query, mode: "insensitive" } },
                  {
                    student: {
                      OR: [
                        { lastName: { contains: query, mode: "insensitive" } },
                        { admissionNo: { contains: query, mode: "insensitive" } },
                      ],
                    },
                  },
                ],
              },
              take: 10,
              orderBy: { issueDate: "desc" },
              select: {
                id: true,
                invoiceNo: true,
                status: true,
                totalMinor: true,
                balanceMinor: true,
                dueDate: true,
                student: {
                  select: { firstName: true, lastName: true, otherNames: true },
                },
              },
            })
          : Promise.resolve([]),
        canReadDocuments
          ? db.document.findMany({
              where: {
                isArchived: false,
                OR: [
                  { title: { contains: query, mode: "insensitive" } },
                  { tags: { has: query } },
                ],
              },
              take: 10,
              select: {
                id: true,
                title: true,
                fileId: true,
                category: true,
                folder: { select: { name: true } },
              },
            })
          : Promise.resolve([]),
      ])
    : [[], [], [], []];

  const total =
    students.length + staff.length + invoices.length + documents.length;

  return (
    <>
      <PageHeader
        title="Search"
        description="Students, staff, invoices and documents in one place."
      />

      <Card className="mb-4">
        <CardBody>
          <form action="/search" method="get" className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <Input
              name="q"
              defaultValue={query}
              autoFocus
              placeholder="Name, admission number, staff number, invoice number, phone…"
              className="h-11 pl-10 text-base"
              aria-label="Search"
            />
          </form>
        </CardBody>
      </Card>

      {!query ? (
        <Card>
          <EmptyState
            icon={<SearchIcon className="size-5" />}
            title="Type to search"
            description="Results are limited to the records you already have permission to open."
          />
        </Card>
      ) : total === 0 ? (
        <Card>
          <EmptyState
            icon={<SearchIcon className="size-5" />}
            title={`Nothing matched “${query}”`}
            description="Try a surname, an admission number, or part of an invoice number."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {students.length ? (
            <Card>
              <CardHeader
                title="Students"
                action={<Badge tone="violet">{students.length}</Badge>}
              />
              <ul className="divide-y divide-[var(--border)]">
                {students.map((student) => {
                  const section = student.enrollments[0]?.classSection;
                  return (
                    <li key={student.id}>
                      <Link
                        href={`/students/${student.id}`}
                        className="flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--bg-subtle)]"
                      >
                        <Avatar
                          name={fullName(student)}
                          src={student.photoUrl}
                          size={32}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {fullName(student)}
                          </p>
                          <p className="truncate text-xs text-[var(--text-subtle)]">
                            {student.admissionNo}
                            {section
                              ? ` · ${section.classLevel.name} ${section.name}`
                              : ""}
                          </p>
                        </div>
                        <Badge tone="neutral">{student.status}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {staff.length ? (
            <Card>
              <CardHeader
                title="Staff"
                action={<Badge tone="info">{staff.length}</Badge>}
              />
              <ul className="divide-y divide-[var(--border)]">
                {staff.map((member) => (
                  <li key={member.id}>
                    <Link
                      href={`/staff/${member.id}`}
                      className="flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--bg-subtle)]"
                    >
                      <Avatar
                        name={fullName(member)}
                        src={member.photoUrl}
                        size={32}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {fullName(member)}
                        </p>
                        <p className="truncate text-xs text-[var(--text-subtle)]">
                          {member.staffNo}
                          {member.jobTitle ? ` · ${member.jobTitle}` : ""}
                          {member.department ? ` · ${member.department}` : ""}
                        </p>
                      </div>
                      <span className="numeric shrink-0 text-xs text-[var(--text-subtle)]">
                        {formatPhone(member.phone)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {invoices.length ? (
            <Card>
              <CardHeader
                title="Invoices"
                action={<Badge tone="warning">{invoices.length}</Badge>}
              />
              <ul className="divide-y divide-[var(--border)]">
                {invoices.map((invoice) => (
                  <li key={invoice.id}>
                    <Link
                      href={`/finance/invoices/${invoice.id}`}
                      className="flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--bg-subtle)]"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-subtle)]">
                        <Receipt className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="numeric truncate text-sm font-medium">
                          {invoice.invoiceNo}
                        </p>
                        <p className="truncate text-xs text-[var(--text-subtle)]">
                          {fullName(invoice.student)} · due{" "}
                          {formatDate(invoice.dueDate)}
                        </p>
                      </div>
                      <span
                        className={`numeric shrink-0 text-sm ${
                          invoice.balanceMinor > 0
                            ? "font-medium text-[var(--danger)]"
                            : "text-[var(--success)]"
                        }`}
                      >
                        {formatMoney(invoice.balanceMinor)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {documents.length ? (
            <Card>
              <CardHeader
                title="Documents"
                action={<Badge tone="teal">{documents.length}</Badge>}
              />
              <ul className="divide-y divide-[var(--border)]">
                {documents.map((document) => (
                  <li key={document.id}>
                    <a
                      href={`/api/files/${document.fileId}`}
                      className="flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--bg-subtle)]"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-subtle)]">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {document.title}
                        </p>
                        <p className="truncate text-xs text-[var(--text-subtle)]">
                          <FolderOpen className="mr-1 inline size-3" />
                          {document.folder?.name ?? document.category ?? "Unfiled"}
                        </p>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}

      <Card className="mt-4">
        <CardBody className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            <GraduationCap className="size-3.5" />
            Students {canReadStudents ? "included" : "hidden — no permission"}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5" />
            Staff {canReadStaff ? "included" : "hidden — no permission"}
          </span>
          <span className="flex items-center gap-1.5">
            <Receipt className="size-3.5" />
            Invoices {canReadFinance ? "included" : "hidden — no permission"}
          </span>
          <span className="flex items-center gap-1.5">
            <FileText className="size-3.5" />
            Documents {canReadDocuments ? "included" : "hidden — no permission"}
          </span>
        </CardBody>
      </Card>
    </>
  );
}
