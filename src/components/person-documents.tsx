"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  BadgeCheck,
  Download,
  Eye,
  FileText,
  ShieldQuestion,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
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
  Textarea,
  type Tone,
} from "@/components/ui";
import { formatBytes, formatDate, humanise, relativeTime } from "@/lib/utils";
import type { DocumentStatus, PersonDocument, PersonKind } from "@/lib/person-documents";

import {
  deletePersonDocumentAction,
  uploadPersonDocumentAction,
  verifyPersonDocumentAction,
  type DocumentState,
} from "@/app/(app)/_actions/person-documents";

const STATUS: Record<DocumentStatus, { label: string; tone: Tone }> = {
  verified: { label: "Verified", tone: "success" },
  pending: { label: "Not verified", tone: "warning" },
  expiring: { label: "Expiring soon", tone: "warning" },
  expired: { label: "Expired", tone: "danger" },
  rejected: { label: "Rejected", tone: "danger" },
};

export function PersonDocuments({
  kind,
  personId,
  personName,
  documents,
  categories,
  canManage,
  canVerify,
}: {
  kind: PersonKind;
  personId: string;
  personName: string;
  documents: PersonDocument[];
  categories: Array<{ value: string; label: string; expires?: boolean }>;
  canManage: boolean;
  canVerify: boolean;
}) {
  const [preview, setPreview] = useState<PersonDocument | null>(null);

  const expired = documents.filter((entry) => entry.status === "expired");
  const expiring = documents.filter((entry) => entry.status === "expiring");
  const unverified = documents.filter((entry) => entry.status === "pending");

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {expired.length ? (
          <Alert tone="danger">
            <span className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                {expired.length} document{expired.length === 1 ? " has" : "s have"}{" "}
                expired: {expired.map((entry) => entry.title).join(", ")}. An expired
                identity document is not proof of anything: ask for a current one.
              </span>
            </span>
          </Alert>
        ) : null}

        {expiring.length ? (
          <Alert tone="warning">
            {expiring.length} document{expiring.length === 1 ? "" : "s"} expiring within
            60 days: {expiring.map((entry) => entry.title).join(", ")}.
          </Alert>
        ) : null}

        <Card>
          <CardHeader
            title="Documents on file"
            description={`${documents.length} held for ${personName}`}
            action={
              unverified.length ? (
                <Badge tone="warning">{unverified.length} unverified</Badge>
              ) : documents.length ? (
                <Badge tone="success">All verified</Badge>
              ) : null
            }
          />

          {documents.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {documents.map((document) => {
                const status = STATUS[document.status];

                return (
                  <li key={document.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-subtle)]">
                          <FileText className="size-4" />
                        </span>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium">{document.title}</span>
                            <Badge tone={status.tone}>{status.label}</Badge>
                            <Badge tone="neutral">{humanise(document.category)}</Badge>
                          </div>

                          <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                            {document.fileName} · {formatBytes(document.sizeBytes)} ·
                            uploaded {relativeTime(document.uploadedAt)}
                            {document.uploadedBy ? ` by ${document.uploadedBy}` : ""}
                          </p>

                          {document.expiresAt ? (
                            <p
                              className={`text-xs ${
                                document.status === "expired"
                                  ? "text-[var(--danger)]"
                                  : document.status === "expiring"
                                    ? "text-[var(--warning)]"
                                    : "text-[var(--text-subtle)]"
                              }`}
                            >
                              {document.status === "expired"
                                ? `Expired ${formatDate(document.expiresAt)}`
                                : `Expires ${formatDate(document.expiresAt)}${
                                    document.daysToExpiry !== null
                                      ? ` · ${document.daysToExpiry} days`
                                      : ""
                                  }`}
                            </p>
                          ) : null}

                          {document.isVerified && document.verifiedBy ? (
                            <p className="text-xs text-[var(--success)]">
                              <BadgeCheck className="mr-1 inline size-3" />
                              Checked by {document.verifiedBy}
                              {document.verifiedAt
                                ? ` on ${formatDate(document.verifiedAt)}`
                                : ""}
                            </p>
                          ) : null}

                          {document.notes ? (
                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                              {document.notes}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Preview"
                          onClick={() => setPreview(document)}
                        >
                          <Eye className="size-3.5" />
                        </Button>

                        <a
                          href={`/api/files/${document.fileId}?download=1`}
                          title="Download"
                          className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                        >
                          <Download className="size-3.5" />
                        </a>

                        {canVerify ? (
                          <form action={verifyPersonDocumentAction}>
                            <input type="hidden" name="kind" value={kind} />
                            <input type="hidden" name="personId" value={personId} />
                            <input type="hidden" name="id" value={document.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              title={
                                document.isVerified
                                  ? "Withdraw verification"
                                  : "Mark as checked against the original"
                              }
                            >
                              {document.isVerified ? (
                                <ShieldQuestion className="size-3.5" />
                              ) : (
                                <BadgeCheck className="size-3.5" />
                              )}
                            </Button>
                          </form>
                        ) : null}

                        {canManage ? (
                          <form action={deletePersonDocumentAction}>
                            <input type="hidden" name="kind" value={kind} />
                            <input type="hidden" name="personId" value={personId} />
                            <input type="hidden" name="id" value={document.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              title="Delete: removes the file as well"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={<FileText className="size-5" />}
              title="No documents on file"
              description={
                canManage
                  ? "Upload identity documents, certificates and records using the panel."
                  : "Nothing has been filed for this person yet."
              }
            />
          )}
        </Card>
      </div>

      {canManage ? (
        <div>
          <UploadPanel kind={kind} personId={personId} categories={categories} />
        </div>
      ) : null}

      {preview ? (
        <PreviewOverlay document={preview} onClose={() => setPreview(null)} />
      ) : null}
    </div>
  );
}

function UploadPanel({
  kind,
  personId,
  categories,
}: {
  kind: PersonKind;
  personId: string;
  categories: Array<{ value: string; label: string; expires?: boolean }>;
}) {
  const [state, action] = useActionState<DocumentState, FormData>(
    uploadPersonDocumentAction,
    {},
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [category, setCategory] = useState(categories[0]?.value ?? "OTHER");

  const expires = categories.find((entry) => entry.value === category)?.expires;

  return (
    <Card>
      <CardHeader
        title="Add a document"
        description="Stored against this person's file and served through an access-checked link."
      />
      <form action={action}>
        <CardBody className="space-y-3">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="personId" value={personId} />

          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

          <label
            htmlFor={`file-${personId}`}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--border-strong)] px-4 py-7 text-center transition-colors hover:bg-[var(--bg-subtle)]"
          >
            <Upload className="size-5 text-[var(--text-subtle)]" />
            <span className="text-sm font-medium">{fileName ?? "Choose a file"}</span>
            <span className="text-xs text-[var(--text-subtle)]">
              PDF, image or Office document, up to 25MB
            </span>
            <input
              id={`file-${personId}`}
              name="file"
              type="file"
              required
              className="sr-only"
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
            />
          </label>

          <Field label="Type" htmlFor={`category-${personId}`}>
            <SearchableSelect
              id={`category-${personId}`}
              name="category"
              clearable={false}
              value={category}
              onChange={(value) => setCategory(value as string)}
              options={categories}
            />
          </Field>

          <Field
            label="Title"
            htmlFor={`title-${personId}`}
            hint="Defaults to the file name."
          >
            <Input id={`title-${personId}`} name="title" />
          </Field>

          <Field
            label="Expires"
            htmlFor={`expires-${personId}`}
            hint={
              expires
                ? "This type usually expires: recording it puts the renewal on the radar."
                : "Leave blank if it does not expire."
            }
          >
            <Input id={`expires-${personId}`} name="expiresAt" type="date" />
          </Field>

          <Field label="Notes" htmlFor={`notes-${personId}`}>
            <Textarea id={`notes-${personId}`} name="notes" rows={2} />
          </Field>

          <SubmitButton />
        </CardBody>
      </form>
    </Card>
  );
}

function PreviewOverlay({
  document: entry,
  onClose,
}: {
  document: PersonDocument;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <button
        type="button"
        aria-label="Close preview"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div className="card relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{entry.title}</p>
            <p className="truncate text-xs text-[var(--text-subtle)]">
              {entry.fileName} · {formatBytes(entry.sizeBytes)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/api/files/${entry.fileId}?download=1`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-xs font-medium"
            >
              <Download className="size-3.5" />
              Download
            </a>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[var(--bg-inset)]">
          {/* Everything is fetched through /api/files, so permission is
              re-checked on the request rather than assumed from this panel. */}
          {entry.previewKind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/files/${entry.fileId}`}
              alt={entry.title}
              className="mx-auto max-h-[75vh] object-contain"
            />
          ) : entry.previewKind === "pdf" || entry.previewKind === "text" ? (
            <iframe
              src={`/api/files/${entry.fileId}`}
              title={entry.title}
              className="h-[75vh] w-full bg-white"
            />
          ) : (
            <div className="p-12 text-center">
              <p className="text-sm font-medium">
                {entry.previewKind === "office"
                  ? "Office documents cannot be previewed in the browser"
                  : "This file type has no preview"}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Download it to open in the appropriate application.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <Upload className="size-4" />
      {pending ? "Uploading…" : "Upload document"}
    </Button>
  );
}
