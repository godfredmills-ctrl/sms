import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, BookX, Clock, Library as LibraryIcon } from "lucide-react";

import { LedgerSearch } from "@/components/ledger-search";
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
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { ITEM_CATEGORIES, NON_CIRCULATING, labelFor } from "@/lib/library";
import { listName } from "@/lib/utils";

import { CatalogueForm } from "./catalogue-form";
import { CopyStatusChip } from "./copy-status";

export const metadata: Metadata = { title: "Library" };
export const dynamic = "force-dynamic";

const PER_PAGE = 25;

/**
 * The library catalogue.
 *
 * The question a catalogue exists to answer is "can I take this home today",
 * so availability is what each row leads with — copies free out of copies
 * held — rather than a shelf mark nobody has memorised. Searching runs in the
 * database rather than over the page, because a library's whole value is
 * finding the one book among four thousand.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("library.read");
  const canManage = userCan(user, "library.manage");
  const canCirculate = userCan(user, "library.circulate");

  const params = await searchParams;
  const query = String(params.q ?? "").trim();
  const category = String(params.category ?? "").trim();
  const { page, skip, take } = pageOf(params, PER_PAGE);

  const where = {
    isActive: true,
    ...(category ? { category } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { author: { contains: query, mode: "insensitive" as const } },
            { isbn: { contains: query.replace(/[\s-]/g, ""), mode: "insensitive" as const } },
            { shelfMark: { contains: query, mode: "insensitive" as const } },
            { copies: { some: { accessionNo: { equals: query.toUpperCase() } } } },
          ],
        }
      : {}),
  };

  const [items, total, titleCount, copyCount, onLoan, overdue, subjects] =
    await Promise.all([
      db.libraryItem.findMany({
        where,
        orderBy: { title: "asc" },
        skip,
        take,
        select: {
          id: true,
          title: true,
          author: true,
          category: true,
          shelfMark: true,
          isbn: true,
          subject: { select: { name: true } },
          copies: {
            select: { id: true, accessionNo: true, status: true, condition: true },
            orderBy: { accessionNo: "asc" },
          },
        },
      }),
      db.libraryItem.count({ where }),
      db.libraryItem.count({ where: { isActive: true } }),
      db.libraryCopy.count(),
      db.libraryLoan.count({ where: { returnedAt: null } }),
      db.libraryLoan.count({
        where: { returnedAt: null, dueAt: { lt: new Date() } },
      }),
      canManage
        ? db.subject.findMany({
            where: { isActive: true },
            orderBy: [{ sortKey: "asc" }, { name: "asc" }],
            select: { id: true, name: true, department: true },
          })
        : Promise.resolve([]),
    ]);

  const subjectOptions: SelectOption[] = subjects.map((subject) => ({
    value: subject.id,
    label: subject.name,
    description: subject.department ?? undefined,
  }));

  return (
    <div>
      <PageHeader
        title="Library"
        description="What the school holds, and what is on the shelf today."
        action={
          canCirculate ? (
            <LinkButton href="/library/loans" size="sm">
              <Clock className="size-4" />
              The issue desk
            </LinkButton>
          ) : null
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Titles"
          value={titleCount.toLocaleString()}
          hint="In the catalogue"
          icon={<LibraryIcon className="size-4" />}
          tone="info"
        />
        <StatCard
          label="Copies"
          value={copyCount.toLocaleString()}
          hint="Physical books held"
          icon={<BookOpen className="size-4" />}
          tone="violet"
        />
        <StatCard
          label="Out on loan"
          value={onLoan.toLocaleString()}
          hint="With pupils and staff"
          icon={<BookOpen className="size-4" />}
          tone="neutral"
        />
        <StatCard
          label="Overdue"
          value={overdue.toLocaleString()}
          hint={overdue ? "Past the due date" : "Nothing late"}
          icon={<BookX className="size-4" />}
          tone={overdue ? "danger" : "success"}
          href={overdue && canCirculate ? "/library/loans?view=overdue" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {/*
            The category rides along in a hidden field, and each category link
            carries the query. Otherwise the two controls sit beside each
            other and silently cancel one another: searching from a category
            widened to the whole catalogue, and picking a category cleared the
            search — in both cases the other control still looked applied.
          */}
          <LedgerSearch
            action="/library"
            defaultValue={query}
            placeholder="Title, author, ISBN, shelf mark or accession number…"
            label="Search the catalogue"
            found={total}
            noun="title"
            hidden={category ? { category } : undefined}
          />

          <div className="mb-3 flex flex-wrap gap-1.5">
            <Link
              href={query ? `/library?q=${encodeURIComponent(query)}` : "/library"}
              className={
                category
                  ? "rounded-full px-3 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                  : "rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white"
              }
            >
              All
            </Link>
            {ITEM_CATEGORIES.map((option) => (
              <Link
                key={option.value}
                href={`/library?category=${option.value}${
                  query ? `&q=${encodeURIComponent(query)}` : ""
                }`}
                className={
                  category === option.value
                    ? "rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white"
                    : "rounded-full px-3 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                }
              >
                {option.label}
              </Link>
            ))}
          </div>

          <Card>
            <CardHeader
              title="Catalogue"
              description={
                query
                  ? `Titles matching “${query}”.`
                  : category
                    ? labelFor(ITEM_CATEGORIES, category)
                    : "Everything the school holds."
              }
            />

            {items.length === 0 ? (
              <EmptyState
                icon={<LibraryIcon className="size-6" />}
                title={query ? "Nothing by that name" : "The catalogue is empty"}
                description={
                  query
                    ? "No title, author, ISBN or accession number matches that."
                    : canManage
                      ? "Catalogue the first title using the form beside this."
                      : "Nothing has been catalogued yet."
                }
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {items.map((item) => {
                  const available = item.copies.filter(
                    (copy) => copy.status === "AVAILABLE",
                  ).length;
                  const held = item.copies.filter(
                    (copy) => copy.status !== "WITHDRAWN" && copy.status !== "LOST",
                  ).length;
                  const reference = NON_CIRCULATING.has(item.category);

                  return (
                    <li key={item.id} className="flex flex-wrap gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{item.title}</span>
                          <Badge tone="neutral">
                            {labelFor(ITEM_CATEGORIES, item.category)}
                          </Badge>
                          {item.subject ? (
                            <Badge tone="info">{item.subject.name}</Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                          {item.author ?? "Author unknown"}
                          {item.shelfMark ? ` · ${item.shelfMark}` : ""}
                          {item.isbn ? ` · ISBN ${item.isbn}` : ""}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-1.5">
                          {item.copies.slice(0, 8).map((copy) =>
                            // Only a library.manage holder gets the control;
                            // everyone else sees the same chip, inert.
                            canManage ? (
                              <CopyStatusChip
                                key={copy.id}
                                copyId={copy.id}
                                accessionNo={copy.accessionNo}
                                status={copy.status}
                              />
                            ) : (
                              <span
                                key={copy.id}
                                title={`${copy.accessionNo} — ${copy.status
                                  .toLowerCase()
                                  .replace(/_/g, " ")}`}
                                className={
                                  copy.status === "AVAILABLE"
                                    ? "numeric rounded border border-[var(--success)] px-1.5 py-0.5 text-[10px] text-[var(--success)]"
                                    : copy.status === "ON_LOAN"
                                      ? "numeric rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-subtle)]"
                                      : "numeric rounded border border-[var(--danger)] px-1.5 py-0.5 text-[10px] text-[var(--danger)]"
                                }
                              >
                                {copy.accessionNo}
                              </span>
                            ),
                          )}
                          {item.copies.length > 8 ? (
                            <span className="text-[10px] text-[var(--text-subtle)]">
                              +{item.copies.length - 8} more
                            </span>
                          ) : null}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        {reference ? (
                          <Badge tone="warning">Reference only</Badge>
                        ) : (
                          <Badge tone={available ? "success" : "danger"}>
                            {available} of {held} free
                          </Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <Pager
              basePath="/library"
              searchParams={params}
              page={page}
              perPage={PER_PAGE}
              total={total}
              label="titles"
            />
          </Card>
        </div>

        {canManage ? (
          <div>
            <Card>
              <CardHeader
                title="Catalogue a title"
                description="Accession numbers are the ones already written in the covers."
              />
              <CatalogueForm subjects={subjectOptions} />
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
