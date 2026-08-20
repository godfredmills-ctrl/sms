import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, BookX, Clock, Library as LibraryIcon } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LOAN_LIMIT, MAX_RENEWALS, daysOverdue } from "@/lib/library";
import { formatDate } from "@/lib/utils";

import { NotLinked } from "../not-linked";

export const metadata: Metadata = { title: "My library" };
export const dynamic = "force-dynamic";

/**
 * What this pupil has out.
 *
 * Their own loans and nothing else — the portal never resolves a student id
 * from the URL, only from the session, so there is no id to change. What it
 * adds beyond the desk's view is the thing a child actually wants to know:
 * how many more they may take, and when this one has to be back.
 */
export default async function StudentLibraryPage() {
  const user = await requireUser();

  const student = await db.student.findFirst({
    where: { userId: user.id },
    select: { id: true, firstName: true },
  });
  if (!student) return <NotLinked />;

  const loans = await db.libraryLoan.findMany({
    where: { studentId: student.id },
    orderBy: [{ returnedAt: { sort: "asc", nulls: "first" } }, { issuedAt: "desc" }],
    take: 60,
    select: {
      id: true,
      issuedAt: true,
      dueAt: true,
      returnedAt: true,
      renewals: true,
      copy: {
        select: {
          accessionNo: true,
          item: { select: { title: true, author: true } },
        },
      },
    },
  });

  const out = loans.filter((loan) => !loan.returnedAt);
  const overdue = out.filter((loan) => daysOverdue(loan.dueAt) > 0);
  const remaining = Math.max(0, LOAN_LIMIT.STUDENT - out.length);

  return (
    <div>
      <PageHeader
        title="My library"
        description="What you have out, and what you have read."
        action={
          <LinkButton href="/library" size="sm" variant="secondary">
            <LibraryIcon className="size-4" />
            Search the catalogue
          </LinkButton>
        }
      />

      {overdue.length ? (
        <Alert tone="danger" title="Something is overdue" className="mb-5">
          {overdue.length === 1
            ? "One of your books was due back before now. Bring it to the library — you cannot borrow another until you do."
            : `${overdue.length} of your books were due back before now. Bring them to the library — you cannot borrow another until you do.`}
        </Alert>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Out now"
          value={out.length}
          hint={`Limit is ${LOAN_LIMIT.STUDENT}`}
          icon={<BookOpen className="size-4" />}
          tone={out.length ? "info" : "neutral"}
        />
        <StatCard
          label="You may take"
          value={overdue.length ? 0 : remaining}
          hint={
            overdue.length
              ? "Not while something is overdue"
              : remaining
                ? "More books today"
                : "You are at the limit"
          }
          icon={<LibraryIcon className="size-4" />}
          tone={!overdue.length && remaining ? "success" : "warning"}
        />
        <StatCard
          label="Read so far"
          value={loans.filter((loan) => loan.returnedAt).length}
          hint="Books returned"
          icon={<Clock className="size-4" />}
          tone="violet"
        />
      </div>

      <Card>
        <CardHeader title="Your books" description="What is out sits at the top." />
        {loans.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-6" />}
            title="You have not borrowed anything yet"
            description="Find something in the catalogue, then take it to the library desk."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {loans.map((loan) => {
              const late = loan.returnedAt ? 0 : daysOverdue(loan.dueAt);
              return (
                <li key={loan.id} className="flex flex-wrap gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{loan.copy.item.title}</p>
                      {loan.returnedAt ? null : late ? (
                        <Badge tone="danger">
                          {late} day{late === 1 ? "" : "s"} late
                        </Badge>
                      ) : (
                        <Badge tone="info">Out</Badge>
                      )}
                      {!loan.returnedAt && loan.renewals >= MAX_RENEWALS ? (
                        <Badge tone="warning">Cannot be renewed again</Badge>
                      ) : null}
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
        )}
      </Card>

      <p className="mt-4 text-xs text-[var(--text-subtle)]">
        Renewals and returns are done at the library desk.{" "}
        <Link href="/library" className="text-[var(--primary)]">
          Browse the catalogue
        </Link>{" "}
        to see what is on the shelf.
      </p>
    </div>
  );
}
