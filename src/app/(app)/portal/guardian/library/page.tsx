import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, BookX, Library as LibraryIcon } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { LOAN_LIMIT, daysOverdue } from "@/lib/library";
import { formatDate, listName } from "@/lib/utils";

import { NotLinked } from "../not-linked";
import { wardIdsFor } from "../wards";

export const metadata: Metadata = { title: "Library books" };
export const dynamic = "force-dynamic";

/**
 * What each of this family's children has out.
 *
 * Guardians were given library.read when the module was built and there was
 * nothing behind it — a permission that granted access to a page that did not
 * exist. This is the page: the question a parent has is not what the school
 * holds but whether their child is about to be told off for a late book.
 *
 * Scoped through wardIdsFor, like every other guardian page: the children are
 * resolved from the signed-in guardian, never from anything in the URL.
 */
export default async function GuardianLibraryPage() {
  const user = await requirePermission("library.read");

  const guardian = await db.guardian.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!guardian) return <NotLinked title="Guardian Portal" />;

  const wardIds = await wardIdsFor(guardian.id);
  if (wardIds.length === 0) return <NotLinked title="Guardian Portal" />;

  const loans = await db.libraryLoan.findMany({
    where: { studentId: { in: wardIds } },
    orderBy: [{ returnedAt: { sort: "asc", nulls: "first" } }, { issuedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      issuedAt: true,
      dueAt: true,
      returnedAt: true,
      student: {
        select: { id: true, firstName: true, lastName: true, otherNames: true },
      },
      copy: {
        select: { accessionNo: true, item: { select: { title: true, author: true } } },
      },
    },
  });

  const out = loans.filter((loan) => !loan.returnedAt);
  const overdue = out.filter((loan) => daysOverdue(loan.dueAt) > 0);

  // Grouped by child, because a parent with three at the school reads this as
  // three separate questions rather than one list.
  const byChild = new Map<string, typeof loans>();
  for (const loan of loans) {
    if (!loan.student) continue;
    const existing = byChild.get(loan.student.id);
    if (existing) existing.push(loan);
    else byChild.set(loan.student.id, [loan]);
  }

  return (
    <div>
      <PageHeader
        title="Library books"
        description="What your children have borrowed, and when it is due back."
        action={
          <LinkButton href="/library" size="sm" variant="secondary">
            <LibraryIcon className="size-4" />
            The catalogue
          </LinkButton>
        }
      />

      {overdue.length ? (
        <Alert tone="danger" title="Something is overdue" className="mb-5">
          {overdue.length === 1
            ? "One library book is past its due date. Please help find it and send it back: your child cannot borrow another until it is returned."
            : `${overdue.length} library books are past their due date. Please help find them and send them back: the children cannot borrow another until they are returned.`}
        </Alert>
      ) : null}

      {loans.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="size-6" />}
            title="Nothing borrowed yet"
            description="Books appear here as the school library issues them."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {[...byChild.entries()].map(([studentId, childLoans]) => {
            const child = childLoans[0].student;
            const childOut = childLoans.filter((loan) => !loan.returnedAt);
            return (
              <Card key={studentId}>
                <CardHeader
                  title={child ? listName(child) : "Child"}
                  description={
                    childOut.length
                      ? `${childOut.length} of ${LOAN_LIMIT.STUDENT} books out`
                      : "Nothing out at the moment"
                  }
                />
                <ul className="divide-y divide-[var(--border)]">
                  {childLoans.slice(0, 20).map((loan) => {
                    const late = loan.returnedAt ? 0 : daysOverdue(loan.dueAt);
                    return (
                      <li key={loan.id} className="flex flex-wrap gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{loan.copy.item.title}</p>
                            {loan.returnedAt ? null : late ? (
                              <Badge tone="danger">
                                <BookX className="size-2.5" />
                                {late} day{late === 1 ? "" : "s"} late
                              </Badge>
                            ) : (
                              <Badge tone="info">Out</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                            {loan.copy.item.author ?? "Author unknown"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-xs">
                          <p className="numeric text-[var(--text-muted)]">
                            {loan.returnedAt
                              ? `Returned ${formatDate(loan.returnedAt)}`
                              : `Due back ${formatDate(loan.dueAt)}`}
                          </p>
                          <p className="numeric text-[var(--text-subtle)]">
                            Borrowed {formatDate(loan.issuedAt)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-[var(--text-subtle)]">
        Books are returned and renewed at the school library desk.{" "}
        <Link href="/library" className="text-[var(--primary)]">
          Browse the catalogue
        </Link>{" "}
        to see what is on the shelf.
      </p>
    </div>
  );
}
