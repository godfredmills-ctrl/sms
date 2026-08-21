import type { Metadata } from "next";
import Link from "next/link";
import { FileSignature, FileText, PenLine } from "lucide-react";

import { LedgerSearch } from "@/components/ledger-search";
import { Pager, pageOf } from "@/components/pager";
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
import { markdownToText } from "@/lib/markdown";
import { formatDate, listName, relativeTime } from "@/lib/utils";

import { DOCUMENT_KINDS } from "./kinds";

export const metadata: Metadata = { title: "Letters & reports" };
export const dynamic = "force-dynamic";

const PER_PAGE = 20;

/**
 * The register of what the school has written.
 *
 * Drafts first, because a draft is the only kind with anything outstanding —
 * a final document is a record, and a record does not need attention. The
 * first line of each is shown as plain text so the list reads as prose rather
 * than as markup.
 */
export default async function LettersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("letter.read");
  const canWrite = userCan(user, "letter.write");

  const params = await searchParams;
  const query = String(params.q ?? "").trim();
  const kind = String(params.kind ?? "").trim();
  const { page, skip, take } = pageOf(params, PER_PAGE);

  const where = {
    ...(kind ? { kind } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { reference: { contains: query, mode: "insensitive" as const } },
            { body: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [documents, total, drafts, finals] = await Promise.all([
    db.writtenDocument.findMany({
      where,
      // Drafts to the top, then most recently touched.
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      skip,
      take,
      select: {
        id: true,
        kind: true,
        reference: true,
        title: true,
        body: true,
        status: true,
        updatedAt: true,
        finalisedAt: true,
        author: { select: { firstName: true, lastName: true } },
        aboutStaff: { select: { id: true, firstName: true, lastName: true } },
        aboutStudent: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    db.writtenDocument.count({ where }),
    db.writtenDocument.count({ where: { status: "DRAFT" } }),
    db.writtenDocument.count({ where: { status: "FINAL" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Letters & reports"
        description="What the school has written, on its own letterhead."
        action={
          canWrite ? (
            <LinkButton href="/letters/new" size="sm">
              <PenLine className="size-4" />
              Write something
            </LinkButton>
          ) : null
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Drafts"
          value={drafts}
          hint={drafts ? "Not sent yet" : "Nothing outstanding"}
          icon={<PenLine className="size-4" />}
          tone={drafts ? "warning" : "neutral"}
        />
        <StatCard
          label="Final"
          value={finals}
          hint="Issued"
          icon={<FileSignature className="size-4" />}
          tone="success"
        />
        <StatCard
          label="In the register"
          value={total}
          hint={query ? `Matching “${query}”` : "All documents"}
          icon={<FileText className="size-4" />}
          tone="info"
        />
      </div>

      <LedgerSearch
        action="/letters"
        defaultValue={query}
        placeholder="Title, reference, or anything in the text…"
        label="Search everything written"
        found={total}
        noun="document"
        hidden={kind ? { kind } : undefined}
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        <Link
          href={query ? `/letters?q=${encodeURIComponent(query)}` : "/letters"}
          className={
            kind
              ? "rounded-full px-3 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
              : "rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white"
          }
        >
          All
        </Link>
        {DOCUMENT_KINDS.map((option) => (
          <Link
            key={option.value}
            href={`/letters?kind=${option.value}${
              query ? `&q=${encodeURIComponent(query)}` : ""
            }`}
            className={
              kind === option.value
                ? "rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white"
                : "rounded-full px-3 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
            }
          >
            {option.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader title="The register" description="Drafts first." />

        {documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-6" />}
            title={query ? "Nothing matches" : "Nothing written yet"}
            description={
              query
                ? "No title, reference or body matches that."
                : canWrite
                  ? "Write a letter, a report or a proposal — it prints on the school letterhead."
                  : "Nothing has been written yet."
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {documents.map((document) => {
              const opening = markdownToText(document.body).replace(/\s+/g, " ").slice(0, 160);
              return (
                <li key={document.id} className="flex flex-wrap gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/letters/${document.id}`}
                        className="font-medium hover:text-[var(--primary)]"
                      >
                        {document.title}
                      </Link>
                      <Badge tone={document.status === "FINAL" ? "success" : "warning"}>
                        {document.status === "FINAL" ? "Final" : "Draft"}
                      </Badge>
                      <Badge tone="neutral">
                        {DOCUMENT_KINDS.find((entry) => entry.value === document.kind)
                          ?.label ?? document.kind}
                      </Badge>
                      {document.reference ? (
                        <span className="numeric text-xs text-[var(--text-subtle)]">
                          {document.reference}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text-muted)]">
                      {opening}
                      {opening.length === 160 ? "…" : ""}
                    </p>

                    <p className="mt-1 text-xs text-[var(--text-subtle)]">
                      {document.author
                        ? `${document.author.firstName} ${document.author.lastName}`
                        : "Unknown author"}
                      {document.aboutStaff ? (
                        <>
                          {" · about "}
                          <Link
                            href={`/staff/${document.aboutStaff.id}`}
                            className="hover:text-[var(--primary)]"
                          >
                            {listName(document.aboutStaff)}
                          </Link>
                        </>
                      ) : null}
                      {document.aboutStudent ? (
                        <>
                          {" · about "}
                          <Link
                            href={`/students/${document.aboutStudent.id}`}
                            className="hover:text-[var(--primary)]"
                          >
                            {listName(document.aboutStudent)}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>

                  <div className="shrink-0 text-right text-xs text-[var(--text-subtle)]">
                    <p className="numeric">
                      {document.finalisedAt
                        ? `Issued ${formatDate(document.finalisedAt)}`
                        : `Edited ${relativeTime(document.updatedAt)}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <Pager
          basePath="/letters"
          searchParams={params}
          page={page}
          perPage={PER_PAGE}
          total={total}
          label="documents"
        />
      </Card>
    </div>
  );
}
