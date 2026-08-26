import type { Metadata } from "next";
import { CalendarRange, CheckCircle2, Lock, LockOpen } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";

import {
  setCurrentTermAction,
  setCurrentYearAction,
  toggleTermLockAction,
  updateTermAction,
} from "../actions";
import { YearForm } from "./year-form";

export const metadata: Metadata = { title: "Academic years" };
export const dynamic = "force-dynamic";

function isoDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export default async function YearsPage() {
  await requirePermission("academic.year.manage");

  const years = await db.academicYear.findMany({
    orderBy: { startDate: "desc" },
    include: {
      terms: { orderBy: { sequence: "asc" } },
      _count: { select: { enrollments: true, invoices: true, reportCards: true } },
    },
  });

  const current = years.find((year) => year.isCurrent);
  const currentTerm = current?.terms.find((term) => term.isCurrent);
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Academic years"
        description="Years, terms and the boundaries everything else is dated against."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Current year"
          value={current?.name ?? "Not set"}
          tone={current ? "success" : "danger"}
          icon={<CalendarRange className="size-4" />}
        />
        <StatCard
          label="Current term"
          value={currentTerm?.name ?? "Not set"}
          hint={
            currentTerm
              ? `${formatDate(currentTerm.startDate)} to ${formatDate(currentTerm.endDate)}`
              : undefined
          }
          tone={currentTerm ? "success" : "warning"}
        />
        <StatCard label="Years on record" value={years.length} tone="violet" />
        <StatCard
          label="Locked terms"
          value={years.reduce(
            (sum, year) => sum + year.terms.filter((term) => term.isLocked).length,
            0,
          )}
          hint="Marks can no longer be edited"
          tone="info"
          icon={<Lock className="size-4" />}
        />
      </div>

      {!current ? (
        <Alert tone="danger" className="mb-4">
          No year is marked current. Attendance, marks, invoices and report cards all
          hang off the current year and term: nothing will work until one is set.
        </Alert>
      ) : !currentTerm ? (
        <Alert tone="warning" className="mb-4">
          {current.name} has no current term. Set one so registers, assessments and
          invoices know which period they belong to.
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {years.length === 0 ? (
            <Card>
              <EmptyState
                icon={<CalendarRange className="size-5" />}
                title="No academic years"
                description="Create one to start enrolling, invoicing and grading."
              />
            </Card>
          ) : null}

          {years.map((year) => (
            <Card key={year.id}>
              <CardHeader
                title={year.name}
                description={`${formatDate(year.startDate)} to ${formatDate(year.endDate)} · ${year._count.enrollments} enrolments, ${year._count.invoices} invoices`}
                action={
                  year.isCurrent ? (
                    <Badge tone="success">
                      <CheckCircle2 className="size-2.5" />
                      Current
                    </Badge>
                  ) : (
                    <form action={setCurrentYearAction}>
                      <input type="hidden" name="id" value={year.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Make current
                      </Button>
                    </form>
                  )
                }
              />

              <ul className="divide-y divide-[var(--border)]">
                {year.terms.map((term) => {
                  const isNow = now >= term.startDate && now <= term.endDate;
                  return (
                    <li key={term.id} className="px-5 py-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium">{term.name}</span>
                          {term.isCurrent ? (
                            <Badge tone="success">Current</Badge>
                          ) : null}
                          {isNow && !term.isCurrent ? (
                            <Badge tone="warning">Today falls in this term</Badge>
                          ) : null}
                          {term.isLocked ? (
                            <Badge tone="info">
                              <Lock className="size-2.5" />
                              Locked
                            </Badge>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-1">
                          {!term.isCurrent ? (
                            <form action={setCurrentTermAction}>
                              <input type="hidden" name="id" value={term.id} />
                              <Button type="submit" variant="ghost" size="sm">
                                Make current
                              </Button>
                            </form>
                          ) : null}
                          <form action={toggleTermLockAction}>
                            <input type="hidden" name="id" value={term.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              {term.isLocked ? (
                                <>
                                  <LockOpen className="size-3.5" />
                                  Unlock
                                </>
                              ) : (
                                <>
                                  <Lock className="size-3.5" />
                                  Lock
                                </>
                              )}
                            </Button>
                          </form>
                        </div>
                      </div>

                      <form
                        action={updateTermAction}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="id" value={term.id} />
                        <Field
                          label="Name"
                          htmlFor={`name-${term.id}`}
                          className="min-w-[120px] flex-1"
                        >
                          <Input
                            id={`name-${term.id}`}
                            name="name"
                            defaultValue={term.name}
                          />
                        </Field>
                        <Field label="Starts" htmlFor={`start-${term.id}`}>
                          <Input
                            id={`start-${term.id}`}
                            name="startDate"
                            type="date"
                            defaultValue={isoDate(term.startDate)}
                          />
                        </Field>
                        <Field label="Ends" htmlFor={`end-${term.id}`}>
                          <Input
                            id={`end-${term.id}`}
                            name="endDate"
                            type="date"
                            defaultValue={isoDate(term.endDate)}
                          />
                        </Field>
                        <Field
                          label="Results due"
                          htmlFor={`due-${term.id}`}
                          hint="Deadline for marks"
                        >
                          <Input
                            id={`due-${term.id}`}
                            name="resultsDueDate"
                            type="date"
                            defaultValue={isoDate(term.resultsDueDate)}
                          />
                        </Field>
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="mb-0.5"
                        >
                          Save
                        </Button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="New academic year" />
            <YearForm />
          </Card>

          <Card>
            <CardBody className="text-xs text-[var(--text-muted)]">
              <p className="mb-1.5 font-medium text-[var(--text)]">What locking does</p>
              <p>
                A locked term stops marks being changed after reports have gone home.
                It stays reversible on purpose: a genuine correction has to be
                possible: but unlocking is a deliberate act that lands in the audit
                log with your name on it.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
