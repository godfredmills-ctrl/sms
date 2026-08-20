import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, BookX, Clock, Library as LibraryIcon } from "lucide-react";

import { Pager, pageOf } from "@/components/pager";
import type { SelectOption } from "@/components/select-search";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_RENEWALS, daysOverdue } from "@/lib/library";
import { formatDate, listName, relativeTime } from "@/lib/utils";

import { IssueForm, RenewButton, ReturnForm } from "./desk-forms";

export const metadata: Metadata = { title: "Issue desk" };
export const dynamic = "force-dynamic";

const PER_PAGE = 30;

/**
 * The issue desk.
 *
 * Two boxes and a list. The overdue view is the default when anything is
 * overdue, because that is the only part of a library that needs someone to
 * act; on a day when everything is back on time the desk opens on what is
 * simply out.
 */
export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("library.circulate");

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);

  const now = new Date();
  const overdueCount = await db.libraryLoan.count({
    where: { returnedAt: null, dueAt: { lt: now } },
  });

  // Default to whichever view has something to do.
  const view = String(params.view ?? (overdueCount ? "overdue" : "out"));

  const where =
    view === "overdue"
      ? { returnedAt: null, dueAt: { lt: now } }
      : view === "returned"
        ? { returnedAt: { not: null } }
        : { returnedAt: null };

  const [loans, total, outCount, dueThisWeek, students, staff] = await Promise.all([
    db.libraryLoan.findMany({
      where,
      orderBy: view === "returned" ? { returnedAt: "desc" } : { dueAt: "asc" },
      skip,
      take,
      select: {
        id: true,
        dueAt: true,
        issuedAt: true,
        returnedAt: true,
        renewals: true,
        copy: {
          select: {
            accessionNo: true,
            item: { select: { title: true, author: true } },
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            otherNames: true,
            admissionNo: true,
          },
        },
        staff: {
          select: { id: true, firstName: true, lastName: true, otherNames: true },
        },
      },
    }),
    db.libraryLoan.count({ where }),
    db.libraryLoan.count({ where: { returnedAt: null } }),
    db.libraryLoan.count({
      where: {
        returnedAt: null,
        dueAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) },
      },
    }),
    db.student.findMany({
      where: { status: "ENROLLED" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 2000,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        otherNames: true,
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
      },
    }),
    db.staff.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        department: true,
      },
    }),
  ]);

  const studentOptions: SelectOption[] = students.map((student) => {
    const section = student.enrollments[0]?.classSection;
    return {
      value: student.id,
      label: listName(student),
      description: [
        student.admissionNo,
        section ? `${section.classLevel.name} ${section.name}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });

  const staffOptions: SelectOption[] = staff.map((person) => ({
    value: person.id,
    label: listName(person),
    description: person.department ?? undefined,
  }));

  const views = [
    { key: "out", label: "Out" },
    { key: "overdue", label: "Overdue" },
    { key: "returned", label: "Returned" },
  ];

  return (
    <div>
      <PageHeader
        title="Issue desk"
        description="Give a book out, take one back."
        breadcrumb={
          <Link href="/library" className="hover:text-[var(--text)]">
            Library
          </Link>
        }
        action={
          <LinkButton href="/library" size="sm" variant="secondary">
            <LibraryIcon className="size-4" />
            The catalogue
          </LinkButton>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Out on loan"
          value={outCount.toLocaleString()}
          hint="Books with someone"
          icon={<BookOpen className="size-4" />}
          tone="info"
        />
        <StatCard
          label="Due this week"
          value={dueThisWeek.toLocaleString()}
          hint="Coming back soon"
          icon={<Clock className="size-4" />}
          tone={dueThisWeek ? "warning" : "neutral"}
        />
        <StatCard
          label="Overdue"
          value={overdueCount.toLocaleString()}
          hint={overdueCount ? "Chase these" : "Nothing late"}
          icon={<BookX className="size-4" />}
          tone={overdueCount ? "danger" : "success"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <Card>
            <CardHeader
              title="Loans"
              description={
                view === "overdue"
                  ? "Past the due date."
                  : view === "returned"
                    ? "Recently brought back."
                    : "Currently with pupils and staff."
              }
            />

            <div className="flex gap-1 border-b border-[var(--border)] px-4 pb-2">
              {views.map((option) => (
                <Link
                  key={option.key}
                  href={`/library/loans?view=${option.key}`}
                  aria-current={view === option.key ? "page" : undefined}
                  className={
                    view === option.key
                      ? "rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white"
                      : "rounded-full px-3 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                  }
                >
                  {option.label}
                </Link>
              ))}
            </div>

            {loans.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="size-6" />}
                title={
                  view === "overdue"
                    ? "Nothing is overdue"
                    : view === "returned"
                      ? "Nothing returned yet"
                      : "No books are out"
                }
                description={
                  view === "overdue"
                    ? "Every book that is out is still within its date."
                    : "Books appear here as they are issued."
                }
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {loans.map((loan) => {
                  const late = loan.returnedAt ? 0 : daysOverdue(loan.dueAt, now);
                  const borrower = loan.student ?? loan.staff;
                  const href = loan.student
                    ? `/students/${loan.student.id}`
                    : loan.staff
                      ? `/staff/${loan.staff.id}`
                      : null;

                  return (
                    <li key={loan.id} className="flex flex-wrap gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{loan.copy.item.title}</span>
                          <span className="numeric text-xs text-[var(--text-subtle)]">
                            {loan.copy.accessionNo}
                          </span>
                          {late ? (
                            <Badge tone="danger">
                              {late} day{late === 1 ? "" : "s"} late
                            </Badge>
                          ) : null}
                          {loan.renewals ? (
                            <Badge tone="neutral">
                              Renewed {loan.renewals}/{MAX_RENEWALS}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                          {borrower ? (
                            href ? (
                              <Link href={href} className="hover:text-[var(--primary)]">
                                {listName(borrower)}
                              </Link>
                            ) : (
                              listName(borrower)
                            )
                          ) : (
                            "Unknown borrower"
                          )}
                          {loan.student?.admissionNo
                            ? ` · ${loan.student.admissionNo}`
                            : ""}
                          {loan.copy.item.author ? ` · ${loan.copy.item.author}` : ""}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                        <span className="numeric text-[var(--text-muted)]">
                          {loan.returnedAt
                            ? `Back ${formatDate(loan.returnedAt)}`
                            : `Due ${formatDate(loan.dueAt)}`}
                        </span>
                        <span className="numeric text-[var(--text-subtle)]">
                          Out {relativeTime(loan.issuedAt)}
                        </span>
                        {!loan.returnedAt && loan.renewals < MAX_RENEWALS && !late ? (
                          <RenewButton loanId={loan.id} />
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <Pager
              basePath="/library/loans"
              searchParams={params}
              page={page}
              perPage={PER_PAGE}
              total={total}
              label="loans"
            />
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Issue a book" />
            <IssueForm students={studentOptions} staff={staffOptions} />
          </Card>
          <Card>
            <CardHeader title="Take one back" />
            <ReturnForm />
          </Card>
        </div>
      </div>
    </div>
  );
}
