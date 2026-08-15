import type { Metadata } from "next";
import Link from "next/link";
import { Award, Plus, ScrollText, ShieldX } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  EmptyState,
  Field,
  Input,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { SearchableSelect } from "@/components/select-search";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, humanise } from "@/lib/utils";

import { createTemplateAction, revokeCredentialAction } from "./actions";
import { EmailCredentialButton } from "./email-button";
import { CertificateForm, TranscriptForm } from "./issue-forms";

export const metadata: Metadata = { title: "Transcripts & Certificates" };
export const dynamic = "force-dynamic";

export default async function CredentialsPage() {
  const user = await requirePermission([
    "assessment.transcript.generate",
    "assessment.certificate.issue",
  ]);

  const canTranscript = userCan(user, "assessment.transcript.generate");
  const canCertificate = userCan(user, "assessment.certificate.issue");
  const canTemplate = userCan(user, "assessment.template.manage");

  const [students, templates, transcripts, certificates] = await Promise.all([
    db.student.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
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
    }),
    db.documentTemplate.findMany({
      where: { kind: "CERTIFICATE", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, isDefault: true },
    }),
    db.transcript.findMany({
      orderBy: { issuedAt: "desc" },
      take: 40,
      select: {
        id: true,
        serialNumber: true,
        purpose: true,
        issuedAt: true,
        revokedAt: true,
        isOfficial: true,
        verifyCode: true,
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
      },
    }),
    db.issuedCertificate.findMany({
      orderBy: { issuedOn: "desc" },
      take: 40,
      select: {
        id: true,
        serialNumber: true,
        title: true,
        kind: true,
        recipientName: true,
        issuedOn: true,
        revokedAt: true,
        verifyCode: true,
      },
    }),
  ]);

  const studentOptions = students.map((student) => ({
    value: student.id,
    label: `${student.lastName}, ${student.firstName}`,
    description: `${student.admissionNo} · ${
      student.enrollments[0]
        ? `${student.enrollments[0].classSection.classLevel.name} ${student.enrollments[0].classSection.name}`
        : humanise(student.status)
    }`,
  }));

  return (
    <>
      <PageHeader
        title="Transcripts & Certificates"
        description="Issue, print and verify official school documents."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Transcripts issued"
          value={transcripts.length}
          tone="violet"
          icon={<ScrollText className="size-4" />}
        />
        <StatCard
          label="Certificates issued"
          value={certificates.length}
          tone="teal"
          icon={<Award className="size-4" />}
        />
        <StatCard
          label="Templates"
          value={templates.length}
          tone={templates.length ? "info" : "warning"}
        />
        <StatCard
          label="Revoked"
          value={
            transcripts.filter((entry) => entry.revokedAt).length +
            certificates.filter((entry) => entry.revokedAt).length
          }
          tone="danger"
          icon={<ShieldX className="size-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          {canTranscript ? (
            <Card>
              <CardHeader
                title="Issue a transcript"
                description="The academic record is frozen at issue and never recomputed."
              />
              <TranscriptForm students={studentOptions} />
            </Card>
          ) : null}

          {canCertificate ? (
            <Card>
              <CardHeader title="Issue a certificate" />
              <CertificateForm students={studentOptions} templates={templates.map((template) => ({
                value: template.id,
                label: template.name,
                description: template.isDefault ? "Default" : undefined,
              }))} />
            </Card>
          ) : null}

          {canTemplate ? (
            <Card>
              <CardHeader
                title="New certificate template"
                description="Design in-app, or upload your own artwork later."
              />
              <form action={createTemplateAction}>
                <CardBody className="space-y-3">
                  <Field label="Name" htmlFor="name" required>
                    <Input
                      id="name"
                      name="name"
                      required
                      placeholder="Graduation Certificate"
                    />
                  </Field>
                  <input type="hidden" name="kind" value="CERTIFICATE" />
                  <Field label="Border style" htmlFor="border">
                    <SearchableSelect
                      id="border"
                      name="border"
                      clearable={false}
                      defaultValue="classic"
                      options={[
                        { value: "classic", label: "Classic double rule" },
                        { value: "ornate", label: "Ornate corners" },
                        { value: "minimal", label: "Minimal" },
                      ]}
                    />
                  </Field>
                  <Field label="Accent colour" htmlFor="accent">
                    <Input
                      id="accent"
                      name="accent"
                      type="color"
                      defaultValue="#128257"
                      className="h-9 p-1"
                    />
                  </Field>
                  <CheckboxField
                    name="isDefault"
                    label="Make this the default template"
                  />
                  <Button type="submit" variant="outline" className="w-full">
                    <Plus className="size-4" />
                    Create template
                  </Button>
                </CardBody>
              </form>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Transcripts" />
            {transcripts.length === 0 ? (
              <EmptyState
                icon={<ScrollText className="size-5" />}
                title="No transcripts issued"
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {transcripts.map((transcript) => (
                  <li
                    key={transcript.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/credentials/transcripts/${transcript.id}`}
                        className="truncate text-sm font-medium hover:text-[var(--primary)] hover:underline"
                      >
                        {transcript.student.firstName} {transcript.student.lastName}
                      </Link>
                      <p className="numeric truncate text-xs text-[var(--text-subtle)]">
                        {transcript.serialNumber} · {formatDate(transcript.issuedAt)}
                        {transcript.purpose ? ` · ${transcript.purpose}` : ""}
                      </p>
                    </div>
                    {transcript.revokedAt ? (
                      <Badge tone="danger">Revoked</Badge>
                    ) : transcript.isOfficial ? (
                      <Badge tone="success">Official</Badge>
                    ) : (
                      <Badge tone="neutral">Unofficial</Badge>
                    )}
                    {!transcript.revokedAt ? (
                      <EmailCredentialButton kind="transcript" id={transcript.id} />
                    ) : null}
                    {!transcript.revokedAt && canTranscript ? (
                      <form action={revokeCredentialAction}>
                        <input type="hidden" name="kind" value="transcript" />
                        <input type="hidden" name="id" value={transcript.id} />
                        <Button type="submit" variant="ghost" size="sm" title="Revoke">
                          <ShieldX className="size-3.5" />
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Certificates" />
            {certificates.length === 0 ? (
              <EmptyState
                icon={<Award className="size-5" />}
                title="No certificates issued"
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {certificates.map((certificate) => (
                  <li
                    key={certificate.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/credentials/certificates/${certificate.id}`}
                        className="truncate text-sm font-medium hover:text-[var(--primary)] hover:underline"
                      >
                        {certificate.title}
                      </Link>
                      <p className="numeric truncate text-xs text-[var(--text-subtle)]">
                        {certificate.serialNumber} · {certificate.recipientName} ·{" "}
                        {formatDate(certificate.issuedOn)}
                      </p>
                    </div>
                    <Badge tone="neutral">{humanise(certificate.kind)}</Badge>
                    {certificate.revokedAt ? <Badge tone="danger">Revoked</Badge> : null}
                    {!certificate.revokedAt ? (
                      <EmailCredentialButton kind="certificate" id={certificate.id} />
                    ) : null}
                    {!certificate.revokedAt && canCertificate ? (
                      <form action={revokeCredentialAction}>
                        <input type="hidden" name="kind" value="certificate" />
                        <input type="hidden" name="id" value={certificate.id} />
                        <Button type="submit" variant="ghost" size="sm" title="Revoke">
                          <ShieldX className="size-3.5" />
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
