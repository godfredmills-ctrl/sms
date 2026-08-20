import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  FileSignature,
  CalendarCheck,
  FileText,
  FolderOpen,
  Home,
  Pill,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";

import { FamilyTree, type FamilyNode } from "@/components/family-tree";
import { PersonDocuments } from "@/components/person-documents";

import { AdmissionStageCard } from "../stage-card";
import { LifecycleCard } from "./lifecycle-card";
import { MedicalForm } from "./medical-form";
import { DOCUMENT_CATEGORIES, documentsFor } from "@/lib/person-documents";
import {
  Alert,
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  LinkButton,
  ProgressBar,
  StatusBadge,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { daysOverdue } from "@/lib/library";
import { getStudentStatement } from "@/lib/finance";
import { studentOutOfScope } from "@/lib/scope";
import { CONDUCT_STATUS_TONES } from "../discipline/fields";
import { formatMoney, percentOf } from "@/lib/money";
import {
  calculateAge,
  formatDate,
  formatPercent,
  formatPhone,
  humanise,
  toNumber,
} from "@/lib/utils";

type TabKey =
  | "overview"
  | "background"
  | "medical"
  | "family"
  | "education"
  | "academics"
  | "attendance"
  | "finance"
  | "documents"
  | "conduct"
  | "library";

const TABS: Array<{ key: TabKey; label: string; icon: typeof Home; permission?: string }> = [
  { key: "overview", label: "Overview", icon: Home },
  { key: "background", label: "Background", icon: Users, permission: "student.background.read" },
  { key: "medical", label: "Medical", icon: Pill, permission: "student.medical.read" },
  { key: "family", label: "Family", icon: Users },
  { key: "education", label: "Education history", icon: BookOpen },
  { key: "academics", label: "Academics", icon: FileText },
  { key: "attendance", label: "Attendance", icon: CalendarCheck },
  { key: "finance", label: "Fees", icon: Wallet, permission: "finance.read" },
  { key: "documents", label: "Documents", icon: FolderOpen },
  { key: "conduct", label: "Conduct", icon: ShieldAlert },
  { key: "library", label: "Library", icon: BookOpen, permission: "library.read" },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const student = await db.student.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  return { title: student ? `${student.firstName} ${student.lastName}` : "Student" };
}

export const dynamic = "force-dynamic";

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePermission(["student.read", "student.read.own"]);
  const { id } = await params;
  const { tab } = await searchParams;

  // Resolved against the tabs this user may see, not against all of them.
  // Hiding a tab from the strip hides the link, and the link is not the way in
  // — ?tab=medical is. A form teacher without student.medical.read was one
  // typed URL away from a child's allergies, diagnoses and clinic visits, and
  // ?tab=background from the family's income band and whether the child is an
  // orphan. Neither left a trace that looked like a refusal, because nothing
  // was refused.
  const visibleTabs = TABS.filter(
    (entry) => !entry.permission || userCan(user, entry.permission),
  );
  const active = (visibleTabs.find((entry) => entry.key === tab)?.key ??
    "overview") as TabKey;

  const student = await db.student.findUnique({
    where: { id },
    include: {
      campus: { select: { name: true } },
      medical: { include: { visits: { orderBy: { visitedAt: "desc" }, take: 10 } } },
      guardians: {
        orderBy: [{ isPrimary: "desc" }, { sortKey: "asc" }],
        include: { guardian: true },
      },
      relations: { orderBy: { generation: "asc" } },
      educationHistory: { orderBy: { sortKey: "asc" } },
      enrollments: {
        orderBy: { enrolledOn: "desc" },
        include: {
          classSection: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
          academicYear: { select: { name: true } },
        },
      },
      reportCards: {
        orderBy: { createdAt: "desc" },
        include: {
          term: { select: { name: true } },
          academicYear: { select: { name: true } },
          lines: {
            orderBy: { sortKey: "asc" },
            include: { subject: { select: { name: true } } },
          },
        },
      },
      documents: { include: { file: true }, orderBy: { uploadedAt: "desc" } },
      disciplinary: { orderBy: { incidentAt: "desc" } },
      // A child's reading is one of the few records that follows them through
      // the whole school, so this is the history rather than a current list —
      // what is out now simply sorts to the top of it.
      libraryLoans: {
        orderBy: [{ returnedAt: { sort: "asc", nulls: "first" } }, { issuedAt: "desc" }],
        take: 50,
        include: {
          copy: {
            include: {
              item: { select: { title: true, author: true, category: true } },
            },
          },
        },
      },
    },
  });

  if (!student) notFound();

  // The list already narrows a form teacher to their own classes, but the
  // list is not the way in — /students/<id> is. Without this, a teacher who
  // learned an id from a register or a clinic entry could read any child's
  // full profile: family, fees, conduct, attendance.
  if (await studentOutOfScope(user, id)) notFound();

  // Class options for the pipeline card, only fetched while there is a
  // pipeline to move through.
  const canMoveClass = userCan(user, "academic.enrollment.manage");
  // Class options: for admitting, for a mid-year move, and for putting a
  // student who left back into a class — reinstating without one would
  // leave them on the roll and off every register.
  const stageSections = userCan(user, "student.update")
      ? (
          await db.classSection.findMany({
            where: { isActive: true },
            orderBy: [{ classLevel: { sequence: "asc" } }, { name: "asc" }],
            select: {
              id: true,
              name: true,
              capacity: true,
              classLevel: { select: { name: true } },
              _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
            },
          })
        ).map((section) => ({
          value: section.id,
          label: `${section.classLevel.name} ${section.name}`,
          description: `${section._count.enrollments}/${section.capacity} places used`,
        }))
      : [];

  const fullName = [student.firstName, student.otherNames, student.lastName]
    .filter(Boolean)
    .join(" ");
  const currentEnrolment = student.enrollments[0];
  const className = currentEnrolment
    ? `${currentEnrolment.classSection.classLevel.name} ${currentEnrolment.classSection.name}`
    : "Not enrolled";

  const [statement, attendanceSummary, allergies] = await Promise.all([
    userCan(user, "finance.read")
      ? getStudentStatement(student.id)
      : Promise.resolve(null),
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId: student.id },
      _count: { _all: true },
    }),
    Promise.resolve(
      (student.medical?.allergies as Array<{
        name: string;
        severity?: string;
        reaction?: string;
        treatment?: string;
      }> | null) ?? [],
    ),
  ]);

  const attendanceTotal = attendanceSummary.reduce(
    (sum, row) => sum + row._count._all,
    0,
  );
  const attendancePresent = attendanceSummary
    .filter((row) => ["PRESENT", "LATE", "EXCUSED", "HALF_DAY"].includes(row.status))
    .reduce((sum, row) => sum + row._count._all, 0);

  const criticalAllergies = allergies.filter(
    (allergy) => allergy.severity === "SEVERE" || allergy.severity === "ANAPHYLAXIS",
  );

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Identity header                                                   */}
      {/* ---------------------------------------------------------------- */}
      <div className="mb-5">
        <Link
          href="/students"
          className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)]"
        >
          ← All students
        </Link>

        <div className="mt-2 flex flex-wrap items-start gap-4">
          <Avatar name={fullName} src={student.photoUrl} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {fullName}
              </h1>
              <StatusBadge status={student.status} />
              {student.isBoarder ? <Badge tone="info">Boarder</Badge> : null}
              {student.onScholarship ? <Badge tone="primary">Scholarship</Badge> : null}
              {student.hasSpecialNeeds ? <Badge tone="warning">SEN</Badge> : null}
            </div>
            <p className="numeric mt-1 text-sm text-[var(--text-muted)]">
              {student.admissionNo} · {className}
              {student.house ? ` · ${student.house} House` : ""}
              {calculateAge(student.dateOfBirth) !== null
                ? ` · ${calculateAge(student.dateOfBirth)} years`
                : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {userCan(user, "student.update") ? (
              <LinkButton href={`/students/${student.id}/edit`} variant="outline" size="sm">
                Edit record
              </LinkButton>
            ) : null}

            {/* One letter per stage: an offer to send, proof of enrolment
                while they are here, a transfer certificate once they leave. */}
            {student.status === "OFFERED" ? (
              <LinkButton
                href={`/api/letters?kind=offer&studentId=${student.id}`}
                target="_blank"
                variant="outline"
                size="sm"
              >
                <FileSignature className="size-4" />
                Offer letter
              </LinkButton>
            ) : null}
            {student.status === "ENROLLED" ? (
              <LinkButton
                href={`/api/letters?kind=attestation&studentId=${student.id}`}
                target="_blank"
                variant="outline"
                size="sm"
              >
                <FileSignature className="size-4" />
                Proof of enrolment
              </LinkButton>
            ) : null}
            {["TRANSFERRED_OUT", "WITHDRAWN", "GRADUATED"].includes(student.status) ? (
              <LinkButton
                href={`/api/letters?kind=transfer&studentId=${student.id}`}
                target="_blank"
                variant="outline"
                size="sm"
              >
                <FileSignature className="size-4" />
                Transfer certificate
              </LinkButton>
            ) : null}
            {userCan(user, "assessment.report.generate") ? (
              <LinkButton href={`/reports/cards?student=${student.id}`} variant="outline" size="sm">
                Report card
              </LinkButton>
            ) : null}
            {userCan(user, "finance.payment.record") ? (
              <LinkButton href={`/finance/payments/new?student=${student.id}`} size="sm">
                Record payment
              </LinkButton>
            ) : null}
          </div>
        </div>
      </div>

      {/* Safety-critical information is surfaced above the tabs — a nurse or
          trip leader must never have to go looking for it. */}
      {criticalAllergies.length > 0 && userCan(user, "student.medical.read") ? (
        <Alert tone="danger" title="Severe allergy" className="mb-4">
          <p>
            {criticalAllergies
              .map(
                (allergy) =>
                  `${allergy.name}${allergy.reaction ? ` — ${allergy.reaction}` : ""}`,
              )
              .join("; ")}
            .{" "}
            {student.medical?.emergencyInstructions
              ? student.medical.emergencyInstructions
              : "See the medical tab for the emergency plan."}
          </p>
        </Alert>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Tabs                                                              */}
      {/* ---------------------------------------------------------------- */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border)] pb-px scrollbar-none">
        {visibleTabs.map((entry) => {
          const isActive = entry.key === active;
          const Icon = entry.icon;
          return (
            <Link
              key={entry.key}
              href={`/students/${student.id}?tab=${entry.key}`}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                isActive
                  ? "border-[var(--primary)] font-medium text-[var(--primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              <Icon className="size-4" />
              {entry.label}
            </Link>
          );
        })}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Panels                                                            */}
      {/* ---------------------------------------------------------------- */}
      {["APPLICANT", "OFFERED"].includes(student.status) &&
      userCan(user, "student.update") ? (
        <div className="mb-4">
          <AdmissionStageCard
            studentId={student.id}
            status={student.status}
            sections={stageSections}
          />
        </div>
      ) : null}

      {/* What happens to a record after admission: a change of class, and
          the ways it pauses or ends. Only for someone who can decide. */}
      {/* Not for a closed record: a graduate's five options were all
          refused by the action, which is a menu that does nothing. */}
      {active === "overview" &&
      !["APPLICANT", "OFFERED", "GRADUATED", "ALUMNI"].includes(student.status) &&
      userCan(user, "student.update") ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <LifecycleCard
            studentId={student.id}
            status={student.status}
            currentClass={currentEnrolment ? className : null}
            sections={stageSections}
            canTransfer={canMoveClass}
          />
        </div>
      ) : null}

      {student.exitDate || student.exitReason ? (
        <Alert tone="warning" className="mb-4">
          <span>
            <strong>{humanise(student.status)}</strong>
            {student.exitDate ? " on " + formatDate(student.exitDate, "long") : ""}
            {student.exitReason ? " — " + student.exitReason : ""}
            {student.transferredTo ? " Moved to " + student.transferredTo + "." : ""}
          </span>
        </Alert>
      ) : null}

      {active === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Personal details" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Full name", value: fullName },
                  { label: "Preferred name", value: student.preferredName },
                  { label: "Admission number", value: student.admissionNo },
                  { label: "Index number", value: student.indexNumber },
                  { label: "Gender", value: humanise(student.gender) },
                  { label: "Date of birth", value: formatDate(student.dateOfBirth, "long") },
                  { label: "Place of birth", value: student.placeOfBirth },
                  { label: "Nationality", value: student.nationality },
                  { label: "Second nationality", value: student.secondNationality },
                  { label: "Ghana Card / ID", value: student.nationalId },
                  { label: "Passport number", value: student.passportNo },
                  { label: "Birth certificate no.", value: student.birthCertNo },
                  { label: "NHIS number", value: student.nhisNumber },
                  { label: "Hometown", value: student.hometown },
                  { label: "Home region", value: student.homeRegion },
                  { label: "Religion", value: student.religion },
                  { label: "Denomination", value: student.denomination },
                  { label: "First language", value: student.firstLanguage },
                  {
                    label: "Other languages",
                    value: student.otherLanguages.join(", ") || "—",
                  },
                ]}
              />

              <hr className="my-5 border-[var(--border)]" />

              <h3 className="mb-3 text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                Contact
              </h3>
              <DescriptionList
                items={[
                  { label: "Email", value: student.email },
                  { label: "Phone", value: formatPhone(student.phone) },
                  { label: "Residential address", value: student.residentialAddress, span: true },
                  { label: "Postal address", value: student.postalAddress },
                  { label: "Ghana Post GPS", value: student.digitalAddr },
                  { label: "City", value: student.city },
                  { label: "Region", value: student.region },
                ]}
              />
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="At a glance" />
              <CardBody className="space-y-4">
                <div>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-xs text-[var(--text-muted)]">Attendance</span>
                    <span className="numeric text-sm font-semibold">
                      {attendanceTotal
                        ? formatPercent(percentOf(attendancePresent, attendanceTotal))
                        : "—"}
                    </span>
                  </div>
                  <ProgressBar
                    value={percentOf(attendancePresent, attendanceTotal)}
                    tone={
                      percentOf(attendancePresent, attendanceTotal) >= 92
                        ? "success"
                        : percentOf(attendancePresent, attendanceTotal) >= 85
                          ? "warning"
                          : "danger"
                    }
                    label="Attendance rate"
                  />
                  <p className="mt-1 numeric text-xs text-[var(--text-subtle)]">
                    {attendancePresent} of {attendanceTotal} sessions
                  </p>
                </div>

                {statement ? (
                  <div>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-xs text-[var(--text-muted)]">Fees paid</span>
                      <span className="numeric text-sm font-semibold">
                        {formatPercent(
                          percentOf(statement.paidMinor, statement.billedMinor),
                        )}
                      </span>
                    </div>
                    <ProgressBar
                      value={percentOf(statement.paidMinor, statement.billedMinor)}
                      tone={statement.balanceMinor > 0 ? "warning" : "success"}
                      label="Fees paid"
                    />
                    <p className="mt-1 numeric text-xs text-[var(--text-subtle)]">
                      {formatMoney(statement.balanceMinor)} outstanding
                    </p>
                  </div>
                ) : null}

                <DescriptionList
                  columns={1}
                  items={[
                    { label: "Class", value: className },
                    { label: "Campus", value: student.campus?.name },
                    { label: "Boarding", value: student.isBoarder ? "Boarder" : "Day student" },
                    { label: "Dormitory", value: student.dormitory },
                    { label: "Admitted", value: formatDate(student.admissionDate) },
                    { label: "Admission type", value: humanise(student.admissionType ?? "") },
                  ]}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Primary contact" />
              <CardBody>
                {student.guardians[0] ? (
                  <div>
                    <p className="text-sm font-medium">
                      {student.guardians[0].guardian.firstName}{" "}
                      {student.guardians[0].guardian.lastName}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {humanise(student.guardians[0].relation)}
                      {student.guardians[0].guardian.occupation
                        ? ` · ${student.guardians[0].guardian.occupation}`
                        : ""}
                    </p>
                    <p className="numeric mt-2 text-sm">
                      {formatPhone(student.guardians[0].guardian.phone)}
                    </p>
                    {student.guardians[0].guardian.email ? (
                      <p className="truncate text-sm text-[var(--text-muted)]">
                        {student.guardians[0].guardian.email}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    No guardian linked yet.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}

      {active === "background" ? (
        <Card>
          <CardHeader
            title="Background & circumstances"
            description="Household and socio-economic context that affects how this student is supported. Handle with care."
          />
          <CardBody>
            <DescriptionList
              items={[
                { label: "Living with", value: humanise(student.livingWith ?? "") },
                { label: "Household size", value: student.householdSize },
                { label: "Birth order", value: student.birthOrder },
                { label: "Number of siblings", value: student.numberOfSiblings },
                {
                  label: "Parents' marital status",
                  value: humanise(student.parentMaritalStatus ?? ""),
                },
                { label: "Orphan", value: student.isOrphan ? "Yes" : "No" },
                { label: "Single-parent household", value: student.isSingleParent ? "Yes" : "No" },
                { label: "On scholarship", value: student.onScholarship ? "Yes" : "No" },
                { label: "Scholarship details", value: student.scholarshipDetails, span: true },
                {
                  label: "Distance to school",
                  value: student.distanceToSchoolKm
                    ? `${toNumber(student.distanceToSchoolKm)} km`
                    : null,
                },
                { label: "Transport", value: humanise(student.transportMode ?? "") },
                { label: "Bus route", value: student.busRoute },
                {
                  label: "Internet at home",
                  value:
                    student.internetAtHome === null
                      ? null
                      : student.internetAtHome
                        ? "Yes"
                        : "No",
                },
                { label: "Device access", value: humanise(student.deviceAccess ?? "") },
                {
                  label: "Special circumstances",
                  value: student.specialCircumstances,
                  span: true,
                },
              ]}
            />

            <hr className="my-5 border-[var(--border)]" />

            <h3 className="mb-3 text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
              Additional needs
            </h3>
            <DescriptionList
              items={[
                {
                  label: "Special educational needs",
                  value: student.hasSpecialNeeds ? "Yes" : "No",
                },
                {
                  label: "Learning support",
                  value: student.learningSupport.length ? (
                    <span className="flex flex-wrap gap-1">
                      {student.learningSupport.map((entry) => (
                        <Badge key={entry} tone="info">
                          {entry}
                        </Badge>
                      ))}
                    </span>
                  ) : null,
                },
                {
                  label: "Gifted & talented",
                  value: student.giftedTalented.length ? (
                    <span className="flex flex-wrap gap-1">
                      {student.giftedTalented.map((entry) => (
                        <Badge key={entry} tone="success">
                          {entry}
                        </Badge>
                      ))}
                    </span>
                  ) : null,
                },
                { label: "Notes", value: student.specialNeedsNotes, span: true },
              ]}
            />
          </CardBody>
        </Card>
      ) : null}

      {active === "medical" ? (
        <div className="space-y-4">
        {userCan(user, "student.medical.update") ? (
          <Card>
            <CardHeader
              title="Record the medical details"
              description="Allergies, conditions and the medication kept at school — what the nurse needs before a visit, not after it."
            />
            <MedicalForm
              studentId={student.id}
              values={{
                bloodGroup: student.medical?.bloodGroup ?? "",
                genotype: student.medical?.genotype ?? "",
                nhisNumber: student.medical?.nhisNumber ?? "",
                dietaryRestrictions: student.medical?.dietaryRestrictions ?? "",
                emergencyInstructions: student.medical?.emergencyInstructions ?? "",
                doctorName: student.medical?.doctorName ?? "",
                doctorPhone: student.medical?.doctorPhone ?? "",
                consentToTreat: student.medical?.consentToTreat ?? false,
                allergies: allergies.map((entry) => ({
                  name: entry.name,
                  severity: entry.severity ?? "MILD",
                  reaction: entry.reaction ?? "",
                })),
                conditions: (
                  (student.medical?.conditions as Array<{
                    condition?: string;
                    notes?: string;
                  }> | null) ?? []
                ).map((entry) => ({
                  condition: entry.condition ?? "",
                  notes: entry.notes ?? "",
                })),
                medications: (
                  (student.medical?.medications as Array<{
                    name?: string;
                    dosage?: string;
                  }> | null) ?? []
                ).map((entry) => ({
                  name: entry.name ?? "",
                  dosage: entry.dosage ?? "",
                })),
              }}
            />
          </Card>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Medical history"
              description="Confidential. Visible only to staff with medical access."
            />
            <CardBody className="space-y-6">
              <DescriptionList
                items={[
                  { label: "Blood group", value: student.medical?.bloodGroup },
                  { label: "Genotype", value: student.medical?.genotype },
                  {
                    label: "Height",
                    value: student.medical?.heightCm
                      ? `${toNumber(student.medical.heightCm)} cm`
                      : null,
                  },
                  {
                    label: "Weight",
                    value: student.medical?.weightKg
                      ? `${toNumber(student.medical.weightKg)} kg`
                      : null,
                  },
                  { label: "Last check-up", value: formatDate(student.medical?.lastCheckup) },
                  {
                    label: "Dietary restrictions",
                    value: student.medical?.dietaryRestrictions,
                    span: true,
                  },
                ]}
              />

              <JsonSection
                title="Allergies"
                icon={<AlertTriangle className="size-3.5" />}
                rows={allergies}
                columns={["name", "severity", "reaction", "treatment"]}
                emptyText="No allergies recorded."
                highlight={(row) =>
                  row.severity === "SEVERE" || row.severity === "ANAPHYLAXIS"
                }
              />

              <JsonSection
                title="Chronic conditions"
                icon={<Activity className="size-3.5" />}
                rows={
                  (student.medical?.conditions as Array<Record<string, string>> | null) ?? []
                }
                columns={["condition", "diagnosedOn", "status", "notes"]}
                emptyText="No conditions recorded."
              />

              <JsonSection
                title="Current medication"
                icon={<Pill className="size-3.5" />}
                rows={
                  (student.medical?.medications as Array<Record<string, string>> | null) ?? []
                }
                columns={["name", "dosage", "frequency", "administerAtSchool"]}
                emptyText="No medication recorded."
              />

              <JsonSection
                title="Immunisations"
                rows={
                  (student.medical?.immunisations as Array<Record<string, string>> | null) ??
                  []
                }
                columns={["vaccine", "date", "batch"]}
                emptyText="No immunisation records."
              />
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Emergency & care" />
              <CardBody>
                <DescriptionList
                  columns={1}
                  items={[
                    { label: "Doctor", value: student.medical?.doctorName },
                    { label: "Doctor's phone", value: formatPhone(student.medical?.doctorPhone) },
                    { label: "Hospital", value: student.medical?.hospitalName },
                    { label: "Insurance", value: student.medical?.insuranceProvider },
                    { label: "Insurance number", value: student.medical?.insuranceNumber },
                    {
                      label: "Consent to treat",
                      value: student.medical?.consentToTreat ? (
                        <Badge tone="success">Given</Badge>
                      ) : (
                        <Badge tone="warning">Not on file</Badge>
                      ),
                    },
                    {
                      label: "Emergency instructions",
                      value: student.medical?.emergencyInstructions,
                    },
                  ]}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Recent clinic visits" />
              {student.medical?.visits.length ? (
                <ul className="divide-y divide-[var(--border)]">
                  {student.medical.visits.map((visit) => (
                    <li key={visit.id} className="px-5 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{visit.complaint}</p>
                        <span className="shrink-0 text-xs text-[var(--text-subtle)]">
                          {formatDate(visit.visitedAt)}
                        </span>
                      </div>
                      {visit.treatment ? (
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {visit.treatment}
                        </p>
                      ) : null}
                      {visit.outcome ? (
                        <Badge tone="neutral" className="mt-1.5">
                          {humanise(visit.outcome)}
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No clinic visits recorded" />
              )}
            </Card>
          </div>
        </div>
        </div>
      ) : null}

      {active === "family" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Family tree"
              description="Relatives across generations, including those without a system record."
            />
            <CardBody>
              <FamilyTree
                student={{ fullName, photoUrl: student.photoUrl, className }}
                nodes={buildFamilyNodes(student)}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Parents & guardians"
              description="Contacts, custody and billing responsibility"
            />
            {student.guardians.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {student.guardians.map((link) => (
                  <li key={link.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {link.guardian.title ? `${link.guardian.title} ` : ""}
                          {link.guardian.firstName} {link.guardian.lastName}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {humanise(link.relation)}
                          {link.guardian.occupation ? ` · ${link.guardian.occupation}` : ""}
                        </p>
                      </div>
                      {link.isPrimary ? <Badge tone="primary">Primary</Badge> : null}
                    </div>

                    <p className="numeric mt-2 text-sm">{formatPhone(link.guardian.phone)}</p>
                    {link.guardian.email ? (
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        {link.guardian.email}
                      </p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-1">
                      {link.isEmergency ? <Badge tone="danger">Emergency</Badge> : null}
                      {link.isBillPayer ? (
                        <Badge tone="warning">
                          Pays {link.billSharePercent || 100}%
                        </Badge>
                      ) : null}
                      {link.hasCustody ? <Badge tone="neutral">Custody</Badge> : null}
                      {link.canPickUp ? <Badge tone="neutral">Can collect</Badge> : null}
                      {link.receivesReports ? (
                        <Badge tone="neutral">Gets reports</Badge>
                      ) : null}
                      {link.livesWithStudent ? (
                        <Badge tone="info">Lives with student</Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No guardians linked"
                description="Link at least one guardian so the school can contact someone."
              />
            )}
          </Card>
        </div>
      ) : null}

      {active === "education" ? (
        <Card>
          <CardHeader
            title="Educational background"
            description="Schools attended before joining, with results where supplied."
          />
          {student.educationHistory.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {student.educationHistory.map((entry) => (
                <li key={entry.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{entry.schoolName}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {[entry.city, entry.country, entry.curriculum]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.verified ? (
                        <Badge tone="success">Verified</Badge>
                      ) : (
                        <Badge tone="warning">Unverified</Badge>
                      )}
                      <span className="text-xs text-[var(--text-subtle)]">
                        {formatDate(entry.startDate)} – {formatDate(entry.endDate)}
                      </span>
                    </div>
                  </div>

                  <DescriptionList
                    className="mt-3"
                    columns={3}
                    items={[
                      { label: "Levels", value: [entry.levelFrom, entry.levelTo].filter(Boolean).join(" → ") },
                      { label: "School type", value: humanise(entry.schoolType ?? "") },
                      {
                        label: "Last average",
                        value: entry.lastAverage ? `${toNumber(entry.lastAverage)}%` : null,
                      },
                      { label: "Last position", value: entry.lastPosition },
                      { label: "Conduct", value: entry.conduct },
                      { label: "Reason for leaving", value: entry.reasonForLeaving },
                    ]}
                  />

                  {entry.notes ? (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">{entry.notes}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No previous schooling recorded"
              description="Add the schools this student attended before admission."
            />
          )}
        </Card>
      ) : null}

      {active === "academics" ? (
        <div className="space-y-4">
          {student.reportCards.length === 0 ? (
            <Card>
              <EmptyState
                title="No report cards yet"
                description="Report cards appear here once results are generated for a term."
              />
            </Card>
          ) : (
            student.reportCards.map((report) => (
              <Card key={report.id}>
                <CardHeader
                  title={`${report.academicYear.name} · ${report.term.name}`}
                  description={
                    report.positionInClass
                      ? `Position ${report.positionInClass} of ${report.classSize}`
                      : undefined
                  }
                  action={
                    <>
                      <StatusBadge status={report.status} />
                      <LinkButton
                        href={`/reports/cards/${report.id}`}
                        variant="outline"
                        size="sm"
                      >
                        Open
                      </LinkButton>
                    </>
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                        <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-muted)]">
                          Subject
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                          CA
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                          Exam
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                          Total
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-[var(--text-muted)]">
                          Grade
                        </th>
                        <th className="hidden px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)] sm:table-cell">
                          Class avg
                        </th>
                        <th className="hidden px-4 py-2 text-left text-xs font-medium text-[var(--text-muted)] md:table-cell">
                          Remark
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.lines.map((line) => (
                        <tr
                          key={line.id}
                          className="border-b border-[var(--border)] last:border-0"
                        >
                          <td className="px-4 py-2">{line.subject.name}</td>
                          <td className="numeric px-4 py-2 text-right">
                            {toNumber(line.caScore)?.toFixed(1) ?? "—"}
                          </td>
                          <td className="numeric px-4 py-2 text-right">
                            {toNumber(line.examScore)?.toFixed(1) ?? "—"}
                          </td>
                          <td className="numeric px-4 py-2 text-right font-medium">
                            {toNumber(line.totalScore)?.toFixed(1) ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {line.grade ? <Badge tone="neutral">{line.grade}</Badge> : "—"}
                          </td>
                          <td className="numeric hidden px-4 py-2 text-right text-[var(--text-muted)] sm:table-cell">
                            {toNumber(line.classAverage)?.toFixed(1) ?? "—"}
                          </td>
                          <td className="hidden px-4 py-2 text-xs text-[var(--text-muted)] md:table-cell">
                            {line.remark ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[var(--bg-subtle)] font-medium">
                        <td className="px-4 py-2">Overall</td>
                        <td colSpan={2} />
                        <td className="numeric px-4 py-2 text-right">
                          {toNumber(report.averageScore)?.toFixed(1) ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {report.overallGrade ?? "—"}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {report.formTeacherRemark || report.aiRemark ? (
                  <CardBody className="border-t border-[var(--border)]">
                    <p className="text-xs font-medium text-[var(--text-subtle)]">
                      Form teacher&apos;s remark
                    </p>
                    <p className="mt-1 text-sm">
                      {report.formTeacherRemark ?? `AI draft (not yet adopted): ${report.aiRemark}`}
                    </p>
                  </CardBody>
                ) : null}
              </Card>
            ))
          )}
        </div>
      ) : null}

      {active === "attendance" ? (
        <Card>
          <CardHeader
            title="Attendance record"
            description={`${attendancePresent} of ${attendanceTotal} sessions attended`}
          />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {attendanceSummary.map((row) => (
                <div
                  key={row.status}
                  className="rounded-lg border border-[var(--border)] p-3 text-center"
                >
                  <p className="numeric text-xl font-semibold">{row._count._all}</p>
                  <p className="text-xs text-[var(--text-muted)]">{humanise(row.status)}</p>
                </div>
              ))}
              {attendanceSummary.length === 0 ? (
                <p className="col-span-full text-sm text-[var(--text-muted)]">
                  No attendance has been recorded for this student yet.
                </p>
              ) : null}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {active === "finance" && statement ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card p-4">
              <p className="text-xs text-[var(--text-muted)]">Total billed</p>
              <p className="numeric mt-1 text-xl font-semibold">
                {formatMoney(statement.billedMinor)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-[var(--text-muted)]">Total paid</p>
              <p className="numeric mt-1 text-xl font-semibold text-[var(--success)]">
                {formatMoney(statement.paidMinor)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-[var(--text-muted)]">Outstanding</p>
              <p
                className={`numeric mt-1 text-xl font-semibold ${
                  statement.balanceMinor > 0 ? "text-[var(--danger)]" : ""
                }`}
              >
                {formatMoney(statement.balanceMinor)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-[var(--text-muted)]">Credit on account</p>
              <p className="numeric mt-1 text-xl font-semibold">
                {formatMoney(statement.creditMinor)}
              </p>
            </div>
          </div>

          <Card>
            <CardHeader title="Invoices" />
            {statement.invoices.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                      <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-muted)]">
                        Invoice
                      </th>
                      <th className="hidden px-4 py-2 text-left text-xs font-medium text-[var(--text-muted)] sm:table-cell">
                        Issued
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-muted)]">
                        Due
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                        Total
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                        Paid
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                        Balance
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.invoices.map((invoice) => (
                      <tr
                        key={invoice.id}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <td className="px-4 py-2">
                          <Link
                            href={`/finance/invoices/${invoice.id}`}
                            className="numeric font-medium hover:text-[var(--primary)] hover:underline"
                          >
                            {invoice.invoiceNo}
                          </Link>
                          {invoice.title ? (
                            <p className="text-xs text-[var(--text-muted)]">
                              {invoice.title}
                            </p>
                          ) : null}
                        </td>
                        <td className="hidden px-4 py-2 sm:table-cell">
                          {formatDate(invoice.issueDate)}
                        </td>
                        <td className="px-4 py-2">{formatDate(invoice.dueDate)}</td>
                        <td className="numeric px-4 py-2 text-right">
                          {formatMoney(invoice.totalMinor)}
                        </td>
                        <td className="numeric px-4 py-2 text-right text-[var(--success)]">
                          {formatMoney(invoice.paidMinor)}
                        </td>
                        <td className="numeric px-4 py-2 text-right font-medium">
                          {formatMoney(invoice.balanceMinor)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <StatusBadge status={invoice.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No invoices raised for this student" />
            )}
          </Card>
        </div>
      ) : null}

      {active === "documents" ? (
        <PersonDocuments
          kind="student"
          personId={student.id}
          personName={fullName}
          documents={await documentsFor("student", student.id)}
          categories={DOCUMENT_CATEGORIES.student}
          canManage={userCan(user, "student.document.manage")}
          canVerify={userCan(user, "student.update")}
        />
      ) : null}

      {active === "library" ? (
        <Card>
          <CardHeader
            title="Library"
            description="What this pupil has out, and what they have read."
          />
          {student.libraryLoans.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {student.libraryLoans.map((loan) => {
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
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {loan.copy.item.author ?? "Author unknown"}
                        {" · "}
                        <span className="numeric">{loan.copy.accessionNo}</span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <p className="numeric text-[var(--text-muted)]">
                        {loan.returnedAt
                          ? `Returned ${formatDate(loan.returnedAt)}`
                          : `Due ${formatDate(loan.dueAt)}`}
                      </p>
                      <p className="numeric text-[var(--text-subtle)]">
                        Borrowed {formatDate(loan.issuedAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={<BookOpen className="size-6" />}
              title="Nothing borrowed yet"
              description="Books appear here as the library issues them."
            />
          )}
        </Card>
      ) : null}

      {active === "conduct" ? (
        <Card>
          <CardHeader title="Conduct & discipline" />
          {student.disciplinary.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {student.disciplinary.map((record) => (
                <li key={record.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{humanise(record.category)}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {formatDate(record.incidentAt, "long")}
                        {record.location ? ` · ${record.location}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge
                        tone={
                          record.severity === "SEVERE" || record.severity === "MAJOR"
                            ? "danger"
                            : record.severity === "MODERATE"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {humanise(record.severity)}
                      </Badge>
                      <Badge tone={CONDUCT_STATUS_TONES[record.status] ?? "neutral"}>
                        {humanise(record.status)}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-sm">{record.description}</p>
                  {record.actionTaken ? (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Action: {record.actionTaken}
                    </p>
                  ) : null}
                  {record.sanction ? (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Sanction: {humanise(record.sanction)}
                      {record.suspensionDays
                        ? ` (${record.suspensionDays} day${record.suspensionDays === 1 ? "" : "s"})`
                        : ""}
                    </p>
                  ) : null}
                  {record.resolution ? (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Resolution: {record.resolution}
                      {record.handledBy ? ` — ${record.handledBy}` : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Clean record"
              description="No disciplinary incidents have been recorded for this student."
            />
          )}
        </Card>
      ) : null}
    </>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

type StudentWithRelations = {
  guardians: Array<{
    id: string;
    relation: string;
    relationLabel: string | null;
    guardian: {
      firstName: string;
      lastName: string;
      occupation: string | null;
      phone: string;
      isAlumni: boolean;
    };
  }>;
  relations: Array<{
    id: string;
    fullName: string;
    relation: string;
    relationLabel: string | null;
    generation: number;
    lineage: string | null;
    isDeceased: boolean;
    isAlumnus: boolean;
    occupation: string | null;
    phone: string | null;
    guardianId: string | null;
    relatedStudentId: string | null;
  }>;
};

/**
 * Merges the two sources of family data — linked guardian records and
 * free-text family relations — into one deduplicated set of tree nodes.
 */
function buildFamilyNodes(student: StudentWithRelations): FamilyNode[] {
  const nodes: FamilyNode[] = [];
  const seen = new Set<string>();

  for (const link of student.guardians) {
    const key = `${link.guardian.firstName} ${link.guardian.lastName}`.toLowerCase();
    seen.add(key);
    nodes.push({
      id: `guardian-${link.id}`,
      fullName: `${link.guardian.firstName} ${link.guardian.lastName}`,
      relation: link.relation,
      relationLabel: link.relationLabel,
      generation: generationFor(link.relation),
      lineage: lineageFor(link.relation),
      occupation: link.guardian.occupation,
      phone: link.guardian.phone,
      isAlumnus: link.guardian.isAlumni,
      isGuardianRecord: true,
    });
  }

  for (const relation of student.relations) {
    // A relation that simply mirrors a linked guardian would otherwise appear twice.
    if (seen.has(relation.fullName.toLowerCase())) continue;
    nodes.push({
      id: `relation-${relation.id}`,
      fullName: relation.fullName,
      relation: relation.relation,
      relationLabel: relation.relationLabel,
      generation: relation.generation,
      lineage: relation.lineage,
      isDeceased: relation.isDeceased,
      isAlumnus: relation.isAlumnus,
      occupation: relation.occupation,
      phone: relation.phone,
      isGuardianRecord: Boolean(relation.guardianId),
      isStudentRecord: Boolean(relation.relatedStudentId),
    });
  }

  return nodes;
}

function generationFor(relation: string): number {
  if (["GRANDFATHER", "GRANDMOTHER"].includes(relation)) return -2;
  if (["BROTHER", "SISTER", "COUSIN"].includes(relation)) return 0;
  return -1;
}

function lineageFor(relation: string): string | null {
  if (["FATHER", "STEP_FATHER"].includes(relation)) return "PATERNAL";
  if (["MOTHER", "STEP_MOTHER"].includes(relation)) return "MATERNAL";
  return null;
}

/** Renders a JSON array column (allergies, medications, …) as a small table. */
function JsonSection({
  title,
  icon,
  rows,
  columns,
  emptyText,
  highlight,
}: {
  title: string;
  icon?: React.ReactNode;
  rows: Array<Record<string, unknown>>;
  columns: string[];
  emptyText: string;
  highlight?: (row: Record<string, string>) => boolean;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
        {icon}
        {title}
      </h3>
      {rows.length ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                {columns.map((column) => (
                  <th
                    key={column}
                    className="px-3 py-1.5 text-left text-xs font-medium text-[var(--text-muted)]"
                  >
                    {humanise(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={index}
                  className={`border-b border-[var(--border)] last:border-0 ${
                    highlight?.(row as Record<string, string>)
                      ? "bg-[var(--danger-soft)]"
                      : ""
                  }`}
                >
                  {columns.map((column) => (
                    <td key={column} className="px-3 py-1.5">
                      {formatCell(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">{emptyText}</p>
      )}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
