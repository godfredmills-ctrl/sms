import type { Metadata } from "next";
import { CalendarHeart, GraduationCap, HeartHandshake, MailCheck } from "lucide-react";

import { Alert, PageHeader, StatCard } from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission, userCan } from "@/lib/auth";
import {
  cohortLabel,
  cohortsDueAReunion,
  donationTotals,
  engagementScore,
  reachability,
  registerHealth,
} from "@/lib/alumni-rules";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

import { AlumnusButton, BringForwardButton } from "./alumni-forms";
import { AlumniTable, type AlumnusRow } from "./alumni-table";

export const metadata: Metadata = { title: "Alumni" };
export const dynamic = "force-dynamic";

/**
 * The register.
 *
 * The number at the top is deliberately not the row count. A register of nine
 * hundred names last checked in 2019 reads as nine hundred contactable alumni
 * and is closer to two hundred, and the gap between those two figures is the
 * only thing on this page worth acting on.
 */
export default async function AlumniPage() {
  const user = await requirePermission("alumni.read");
  const canManage = userCan(user, "alumni.manage");
  const canContact = userCan(user, "alumni.contact");

  const now = new Date();

  const [alumni, engagements, waiting] = await Promise.all([
    db.alumnus.findMany({
      orderBy: [{ graduationYear: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        nameAtSchool: true,
        photoUrl: true,
        graduationYear: true,
        finalClass: true,
        email: true,
        phone: true,
        whatsapp: true,
        city: true,
        country: true,
        university: true,
        occupation: true,
        employer: true,
        consentToContact: true,
        consentAt: true,
        verifiedAt: true,
        deceasedOn: true,
        engagements: { select: { kind: true, happenedOn: true, amountMinor: true } },
      },
    }),
    db.alumniEngagementRecord.findMany({
      select: { kind: true, happenedOn: true, amountMinor: true, alumnusId: true },
    }),
    // Graduates who are not on the register yet. Counted rather than listed:
    // the number is the prompt, and the list is what the button produces.
    db.student.count({
      where: { status: { in: ["GRADUATED", "ALUMNI"] }, alumnus: { is: null } },
    }),
  ]);

  const health = registerHealth(alumni, now);
  const donations = donationTotals(engagements);
  const reunions = cohortsDueAReunion(
    alumni.map((alumnus) => alumnus.graduationYear),
    now,
  );

  const rows: AlumnusRow[] = alumni.map((alumnus) => {
    const state = reachability(alumnus, now);
    return {
      id: alumnus.id,
      name: [alumnus.firstName, alumnus.otherNames, alumnus.lastName]
        .filter(Boolean)
        .join(" "),
      nameAtSchool: alumnus.nameAtSchool,
      photoUrl: alumnus.photoUrl,
      cohort: cohortLabel(alumnus.graduationYear),
      graduationYear: alumnus.graduationYear,
      finalClass: alumnus.finalClass,
      email: alumnus.email,
      phone: alumnus.phone,
      whereabouts: [alumnus.occupation, alumnus.employer].filter(Boolean).join(" at ") ||
        alumnus.university ||
        "",
      location: [alumnus.city, alumnus.country].filter(Boolean).join(", "),
      reachable: state.reachable,
      reachReason: state.reason,
      deceased: Boolean(alumnus.deceasedOn),
      engagementScore: engagementScore(alumnus.engagements, now),
      engagementCount: alumnus.engagements.length,
    };
  });

  return (
    <>
      <PageHeader
        title="Alumni"
        description="The people who left, where they are, and which of them the school can actually reach."
        action={
          <>
            <RefreshButton />
            {canManage ? (
              <>
                <BringForwardButton waiting={waiting} />
                <AlumnusButton />
              </>
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="On the register"
          value={health.total.toLocaleString()}
          hint={health.deceased ? `${health.deceased} deceased` : "Across every cohort"}
          tone="violet"
          icon={<GraduationCap className="size-4" />}
        />
        <StatCard
          label="Reachable"
          value={health.reachable.toLocaleString()}
          hint="Agreed, contactable, confirmed"
          tone={health.reachable ? "success" : "warning"}
          icon={<MailCheck className="size-4" />}
        />
        <StatCard
          label="Out of date"
          value={health.stale.toLocaleString()}
          hint="Agreed, but the details need checking"
          tone={health.stale ? "warning" : "success"}
          icon={<CalendarHeart className="size-4" />}
        />
        <StatCard
          label="Given"
          value={formatMoney(donations.totalMinor)}
          hint={`${donations.donors} donors, ${donations.count} gifts`}
          tone="teal"
          icon={<HeartHandshake className="size-4" />}
        />
      </div>

      {/*
        The honest sentence about the register's real size. Without it the
        headline count is the number a school quotes to a sponsor, and it is
        wrong by whatever fraction of it has not been checked since 2019.
      */}
      {health.total > 0 && health.reachable < health.total ? (
        <Alert tone={health.reachable === 0 ? "warning" : "info"} className="mb-4">
          <span className="block font-medium">
            {health.reachable} of {health.total} can actually be written to today.
          </span>
          <span className="block">
            {health.noConsent > 0
              ? `${health.noConsent} have not agreed to be contacted. `
              : ""}
            {health.noChannel > 0
              ? `${health.noChannel} agreed but have no email, phone or WhatsApp on file. `
              : ""}
            {health.stale > 0
              ? `${health.stale} have details nobody has confirmed in two years. `
              : ""}
            A register is worth what can be reached from it, not what is in it.
          </span>
        </Alert>
      ) : null}

      {waiting > 0 && canManage ? (
        <Alert tone="info" className="mb-4">
          {waiting} {waiting === 1 ? "graduate is" : "graduates are"} not on the register
          yet. Bringing them forward copies what the school knows as a starting
          point; none of it counts as confirmed, and none of them has agreed to
          be contacted.
        </Alert>
      ) : null}

      {reunions.length ? (
        <Alert tone="info" className="mb-4">
          <span className="block font-medium">Reunions falling this year</span>
          <span className="block">
            {reunions
              .map((entry) => `${cohortLabel(entry.year)}, ${entry.milestone} years`)
              .join(". ")}
            .
          </span>
        </Alert>
      ) : null}

      <AlumniTable rows={rows} canContact={canContact} />
    </>
  );
}
