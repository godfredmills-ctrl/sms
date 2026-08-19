import type { Metadata } from "next";
import Link from "next/link";
import { Car, DoorOpen, IdCard, Printer, Users } from "lucide-react";

import { Pager, pageOf } from "@/components/pager";
import type { SelectOption } from "@/components/select-search";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatPhone, humanise, listName, relativeTime } from "@/lib/utils";

import { SignInForm } from "./sign-in-form";
import { CloseOpenVisitsButton, SignOutButton } from "./sign-out-button";

export const metadata: Metadata = { title: "Visitors" };
export const dynamic = "force-dynamic";

const PER_PAGE = 25;

/**
 * The visitor log book.
 *
 * The paper book by the door, with the two things paper cannot do: it can be
 * searched months later when someone asks who was on site on a given day,
 * and it can answer "who is in the building right now" during a drill — the
 * question a bound book answers only by being carried outside.
 *
 * On site is therefore the page's headline and its default view. Everything
 * else is history.
 */
export default async function VisitorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("visitor.read");
  const canManage = userCan(user, "visitor.manage");

  const params = await searchParams;
  const query = String(params.q ?? "").trim();
  const view = String(params.view ?? "onsite");
  const { page, skip, take } = pageOf(params, PER_PAGE);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const search = query
    ? {
        OR: [
          { fullName: { contains: query, mode: "insensitive" as const } },
          { organisation: { contains: query, mode: "insensitive" as const } },
          { badgeNo: { contains: query, mode: "insensitive" as const } },
          { purpose: { contains: query, mode: "insensitive" as const } },
          { vehicleReg: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  // A search means you are looking for someone in particular, and they have
  // almost certainly left — so searching looks through the whole book rather
  // than only at who is standing in the building.
  const where =
    query || view === "all"
      ? search
      : view === "today"
        ? { signedInAt: { gte: startOfToday } }
        : { signedOutAt: null };

  const [rows, total, onSite, todayCount, staff, students] = await Promise.all([
    db.visitor.findMany({
      where,
      orderBy: { signedInAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        fullName: true,
        phone: true,
        organisation: true,
        category: true,
        purpose: true,
        idType: true,
        idNumber: true,
        vehicleReg: true,
        badgeNo: true,
        signedInAt: true,
        signedOutAt: true,
        notes: true,
        hostStaff: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
        aboutStudent: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    db.visitor.count({ where }),
    db.visitor.count({ where: { signedOutAt: null } }),
    db.visitor.count({ where: { signedInAt: { gte: startOfToday } } }),
    canManage
      ? db.staff.findMany({
          where: { status: "ACTIVE" },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: { id: true, firstName: true, lastName: true, jobTitle: true },
          take: 500,
        })
      : Promise.resolve([]),
    canManage
      ? db.student.findMany({
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
          },
          take: 2000,
        })
      : Promise.resolve([]),
  ]);

  const staffOptions: SelectOption[] = staff.map((person) => ({
    value: person.id,
    label: listName(person),
    description: person.jobTitle ?? undefined,
  }));

  const studentOptions: SelectOption[] = students.map((child) => {
    const section = child.enrollments[0]?.classSection;
    return {
      value: child.id,
      label: listName(child),
      description: [
        child.admissionNo,
        section ? `${section.classLevel.name} ${section.name}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });

  const views = [
    { key: "onsite", label: "On site" },
    { key: "today", label: "Today" },
    { key: "all", label: "All" },
  ];

  return (
    <div>
      <PageHeader
        title="Visitors"
        description="Who is in the building, and who has been."
        action={
          <>
            {canManage ? <CloseOpenVisitsButton count={onSite} /> : null}
            <LinkButton
              href="/api/visitor-passes?scope=onsite"
              target="_blank"
              variant="secondary"
              size="sm"
            >
              <Printer className="size-4" />
              Print passes on site
            </LinkButton>
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="On site now"
          value={onSite}
          hint="Signed in, not signed out"
          icon={<Users className="size-4" />}
          tone={onSite ? "warning" : "success"}
        />
        <StatCard
          label="Signed in today"
          value={todayCount}
          hint="Since midnight"
          icon={<DoorOpen className="size-4" />}
          tone="info"
        />
        <StatCard
          label="In the book"
          value={total}
          hint={query ? `Matching “${query}”` : "Records in this view"}
          icon={<IdCard className="size-4" />}
          tone="neutral"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 lg:order-1">
          <Card>
            <CardHeader
              title="The register"
              description={
                query
                  ? "Searching the whole book."
                  : view === "today"
                    ? "Everyone who came through today."
                    : view === "all"
                      ? "Every visit recorded."
                      : "Everyone currently in the building."
              }
              action={
                <form method="get" className="flex items-center gap-2">
                  <input type="hidden" name="view" value={view} />
                  <Input
                    name="q"
                    defaultValue={query}
                    placeholder="Name, pass no., vehicle…"
                    className="h-8 w-44 text-sm"
                    aria-label="Search the visitor book"
                  />
                </form>
              }
            />

            <div className="flex gap-1 border-b border-[var(--border)] px-4 pb-2">
              {views.map((option) => (
                <Link
                  key={option.key}
                  href={`/visitors?view=${option.key}`}
                  aria-current={view === option.key && !query ? "page" : undefined}
                  className={
                    view === option.key && !query
                      ? "rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white"
                      : "rounded-full px-3 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                  }
                >
                  {option.label}
                </Link>
              ))}
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={<DoorOpen className="size-6" />}
                title={query ? "Nobody by that name" : "Nobody signed in"}
                description={
                  query
                    ? "No visit in the book matches that search."
                    : "The book fills up as people arrive at the desk."
                }
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {rows.map((row) => {
                  const onSiteNow = !row.signedOutAt;
                  return (
                    <li key={row.id} className="flex flex-wrap gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{row.fullName}</span>
                          <Badge tone={onSiteNow ? "warning" : "neutral"}>
                            {onSiteNow ? "On site" : "Signed out"}
                          </Badge>
                          <span className="numeric text-xs text-[var(--text-subtle)]">
                            {row.badgeNo}
                          </span>
                        </div>

                        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                          {humanise(row.category)}
                          {row.organisation ? ` · ${row.organisation}` : ""} — {row.purpose}
                        </p>

                        <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                          {row.hostStaff ? (
                            <>
                              Seeing{" "}
                              <Link
                                href={`/staff/${row.hostStaff.id}`}
                                className="hover:text-[var(--primary)]"
                              >
                                {listName(row.hostStaff)}
                              </Link>
                            </>
                          ) : (
                            "Seeing reception"
                          )}
                          {row.aboutStudent ? (
                            <>
                              {" · about "}
                              <Link
                                href={`/students/${row.aboutStudent.id}`}
                                className="hover:text-[var(--primary)]"
                              >
                                {listName(row.aboutStudent)}
                              </Link>
                            </>
                          ) : null}
                          {row.phone ? ` · ${formatPhone(row.phone)}` : ""}
                          {row.vehicleReg ? (
                            <span className="ml-1 inline-flex items-center gap-1">
                              <Car className="size-3" />
                              {row.vehicleReg}
                            </span>
                          ) : null}
                          {row.idType ? (
                            <>
                              {" · "}
                              {row.idType}
                              {row.idNumber ? ` ${row.idNumber}` : ""}
                            </>
                          ) : null}
                        </p>

                        {row.notes ? (
                          <p className="mt-1 text-xs text-[var(--text-subtle)] italic">
                            {row.notes}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                        <span className="numeric text-[var(--text-muted)]">
                          In {formatDateTime(row.signedInAt)}
                        </span>
                        <span className="numeric text-[var(--text-subtle)]">
                          {row.signedOutAt
                            ? `Out ${formatDateTime(row.signedOutAt)}`
                            : `Here ${relativeTime(row.signedInAt)}`}
                        </span>
                        <div className="mt-1 flex items-center gap-2">
                          <Link
                            href={`/api/visitor-passes?id=${row.id}`}
                            target="_blank"
                            className="text-[var(--text-subtle)] hover:text-[var(--primary)]"
                            aria-label={`Reprint the pass for ${row.fullName}`}
                          >
                            <Printer className="size-4" />
                          </Link>
                          {onSiteNow && canManage ? (
                            <SignOutButton id={row.id} name={row.fullName} />
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <Pager
              basePath="/visitors"
              searchParams={params}
              page={page}
              perPage={PER_PAGE}
              total={total}
              label="visits"
            />
          </Card>
        </div>

        {canManage ? (
          <div className="lg:order-2">
            <Card>
              <CardHeader
                title="Sign someone in"
                description="Name and reason are all that is needed."
              />
              <SignInForm staff={staffOptions} students={studentOptions} />
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
