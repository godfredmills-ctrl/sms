import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Lock, Megaphone, ShieldCheck, UserPlus, Users } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  PageHeader,
  StatCard,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { SearchableSelect } from "@/components/select-search";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { percentOf } from "@/lib/money";
import { formatDateTime, listName } from "@/lib/utils";

import {
  addCandidateAction,
  closeElectionAction,
  openElectionAction,
  publishResultsAction,
} from "../../actions";

export const metadata: Metadata = { title: "Manage election" };
export const dynamic = "force-dynamic";

export default async function ManageElectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requirePermission("election.manage");
  const { slug } = await params;

  const election = await db.election.findUnique({
    where: { slug },
    include: {
      positions: {
        orderBy: { sortKey: "asc" },
        include: { candidates: { orderBy: { ballotOrder: "asc" } } },
      },
      _count: { select: { voters: true, ballots: true } },
    },
  });

  if (!election) notFound();

  const [students, turnout] = await Promise.all([
    db.student.findMany({
      where: { status: "ENROLLED" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 1000,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        admissionNo: true,
        enrollments: {
          where: { status: "ACTIVE" },
          take: 1,
          select: { classSection: { select: { name: true } } },
        },
      },
    }),
    db.voterRoll.count({ where: { electionId: election.id, hasVoted: true } }),
  ]);

  const studentOptions = students.map((student) => ({
    value: student.id,
    label: listName(student),
    description: `${student.admissionNo}${
      student.enrollments[0]?.classSection
        ? ` · ${student.enrollments[0].classSection.name}`
        : ""
    }`,
  }));

  const candidateCount = election.positions.reduce(
    (sum, position) => sum + position.candidates.length,
    0,
  );

  // Lifecycle transitions are bound here rather than posted as ids so the
  // election being acted on cannot be swapped by editing the form.
  async function open() {
    "use server";
    await openElectionAction(election!.id);
  }
  async function close() {
    "use server";
    await closeElectionAction(election!.id);
  }
  async function publish() {
    "use server";
    await publishResultsAction(election!.id);
  }

  const canPublish = userCan(user, "election.result.publish");

  return (
    <>
      <PageHeader
        title={election.title}
        description="Candidates, eligibility and the voting lifecycle."
        breadcrumb={
          <>
            <Link href="/elections" className="hover:text-[var(--text)]">
              Elections
            </Link>
            <span className="mx-1.5">/</span>
            <Link
              href={`/elections/${election.slug}`}
              className="hover:text-[var(--text)]"
            >
              {election.title}
            </Link>
          </>
        }
        action={<StatusBadge status={election.status} />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Positions"
          value={election.positions.length}
          tone="violet"
        />
        <StatCard
          label="Candidates"
          value={candidateCount}
          tone={candidateCount ? "info" : "warning"}
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Voter roll"
          value={election._count.voters}
          hint={election.status === "DRAFT" ? "Built when voting opens" : undefined}
          tone="teal"
        />
        <StatCard
          label="Turnout"
          value={`${percentOf(turnout, election._count.voters).toFixed(0)}%`}
          hint={`${turnout} voted`}
          tone="success"
          icon={<CheckCircle2 className="size-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {election.positions.map((position) => (
            <Card key={position.id}>
              <CardHeader
                title={position.title}
                description={`${position.seats} seat${
                  position.seats === 1 ? "" : "s"
                } · choose ${position.maxSelections}`}
                action={
                  <Badge tone={position.candidates.length ? "neutral" : "warning"}>
                    {position.candidates.length} candidate
                    {position.candidates.length === 1 ? "" : "s"}
                  </Badge>
                }
              />
              <CardBody className="space-y-4">
                {position.candidates.length ? (
                  <ul className="divide-y divide-[var(--border)]">
                    {position.candidates.map((candidate) => (
                      <li
                        key={candidate.id}
                        className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {candidate.displayName}
                          </p>
                          {candidate.slogan ? (
                            <p className="truncate text-xs text-[var(--text-muted)]">
                              &ldquo;{candidate.slogan}&rdquo;
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge status={candidate.status} />
                          <span className="numeric text-sm">{candidate.voteCount}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    No candidates yet.
                  </p>
                )}

                {election.status === "DRAFT" || election.status === "SCHEDULED" ? (
                  <form
                    action={addCandidateAction}
                    className="space-y-3 rounded-lg border border-dashed border-[var(--border-strong)] p-3"
                  >
                    <input type="hidden" name="positionId" value={position.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Student" htmlFor={`student-${position.id}`}>
                        <SearchableSelect
                          id={`student-${position.id}`}
                          name="studentId"
                          options={studentOptions}
                          placeholder="Search students…"
                        />
                      </Field>
                      <Field
                        label="Name on ballot"
                        htmlFor={`name-${position.id}`}
                        required
                      >
                        <Input
                          id={`name-${position.id}`}
                          name="displayName"
                          required
                          placeholder="Ama Serwaa Boateng"
                        />
                      </Field>
                    </div>
                    <Field label="Slogan" htmlFor={`slogan-${position.id}`}>
                      <Input
                        id={`slogan-${position.id}`}
                        name="slogan"
                        placeholder="Service with integrity"
                      />
                    </Field>
                    <Field label="Manifesto" htmlFor={`manifesto-${position.id}`}>
                      <Textarea id={`manifesto-${position.id}`} name="manifesto" rows={2} />
                    </Field>
                    <Button type="submit" variant="outline" size="sm">
                      <UserPlus className="size-3.5" />
                      Add candidate
                    </Button>
                  </form>
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Lifecycle" />
            <CardBody className="space-y-3">
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Opens</dt>
                  <dd>{formatDateTime(election.opensAt)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Closes</dt>
                  <dd>{formatDateTime(election.closesAt)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Ballot</dt>
                  <dd>{election.isSecret ? "Secret" : "Attributable"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Live results</dt>
                  <dd>{election.showLiveResults ? "Visible" : "Hidden until published"}</dd>
                </div>
              </dl>

              {election.status === "DRAFT" || election.status === "SCHEDULED" ? (
                <>
                  <Alert tone="info">
                    <span className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                      Opening freezes the voter roll. Anyone enrolled afterwards will
                      not be able to vote, which keeps the turnout denominator fixed.
                    </span>
                  </Alert>
                  <form action={open}>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={candidateCount === 0}
                    >
                      <Megaphone className="size-4" />
                      Open voting
                    </Button>
                  </form>
                  {candidateCount === 0 ? (
                    <p className="text-xs text-[var(--text-subtle)]">
                      Add at least one candidate first.
                    </p>
                  ) : null}
                </>
              ) : null}

              {election.status === "OPEN" ? (
                <form action={close}>
                  <Button type="submit" variant="outline" className="w-full">
                    <Lock className="size-4" />
                    Close voting
                  </Button>
                </form>
              ) : null}

              {election.status === "CLOSED" && canPublish ? (
                <form action={publish}>
                  <Button type="submit" className="w-full">
                    <CheckCircle2 className="size-4" />
                    Publish results
                  </Button>
                </form>
              ) : null}

              {election.status === "PUBLISHED" ? (
                <Alert tone="success">
                  Results published {formatDateTime(election.resultsPublishedAt)}.
                </Alert>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Eligibility" />
            <CardBody className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {election.eligiblePortals.map((portal) => (
                  <Badge key={portal} tone="info">
                    {portal === "STUDENT"
                      ? "Students"
                      : portal === "STAFF"
                        ? "Staff"
                        : "Guardians"}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                {election.eligibleClassIds.length
                  ? `Restricted to ${election.eligibleClassIds.length} class section(s).`
                  : "Open to every active account in the portals above."}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
