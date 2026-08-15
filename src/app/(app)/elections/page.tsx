import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Settings2, Users, Vote } from "lucide-react";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ProgressBar,
  StatCard,
  StatusBadge,
  PageHeader,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { percentOf } from "@/lib/money";
import { formatDateTime, humanise, relativeTime } from "@/lib/utils";

import { ElectionForm } from "./election-form";

export const metadata: Metadata = { title: "Elections" };
export const dynamic = "force-dynamic";

export default async function ElectionsPage() {
  const user = await requirePermission("election.read");
  const canManage = userCan(user, "election.manage");

  const elections = await db.election.findMany({
    orderBy: [{ status: "asc" }, { opensAt: "desc" }],
    take: 60,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      kind: true,
      status: true,
      opensAt: true,
      closesAt: true,
      isSecret: true,
      _count: { select: { positions: true, voters: true } },
    },
  });

  // Turnout for every listed election in one grouped query rather than a
  // count per row — the list is the page's main cost otherwise.
  const votedByElection = await db.voterRoll.groupBy({
    by: ["electionId"],
    where: {
      hasVoted: true,
      electionId: { in: elections.map((election) => election.id) },
    },
    _count: { _all: true },
  });
  const voted = new Map(
    votedByElection.map((row) => [row.electionId, row._count._all]),
  );

  const myRolls = await db.voterRoll.findMany({
    where: {
      userId: user.id,
      electionId: { in: elections.map((election) => election.id) },
    },
    select: { electionId: true, hasVoted: true },
  });
  const roll = new Map(myRolls.map((entry) => [entry.electionId, entry.hasVoted]));

  const now = new Date();
  const open = elections.filter(
    (election) =>
      election.status === "OPEN" && now >= election.opensAt && now <= election.closesAt,
  );
  const awaitingMyVote = open.filter((election) => roll.get(election.id) === false);

  return (
    <>
      <PageHeader
        title="Elections"
        description="Secret-ballot voting for SRC, class representatives, prefects and staff."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open now"
          value={open.length}
          tone="success"
          icon={<Vote className="size-4" />}
        />
        <StatCard
          label="Awaiting your vote"
          value={awaitingMyVote.length}
          tone={awaitingMyVote.length ? "warning" : "neutral"}
          icon={<CheckCircle2 className="size-4" />}
          hint={awaitingMyVote.length ? "Ballots you can still cast" : "You are up to date"}
        />
        <StatCard
          label="Elections"
          value={elections.length}
          tone="violet"
          icon={<CalendarClock className="size-4" />}
        />
        <StatCard
          label="Ballots cast"
          value={[...voted.values()].reduce((sum, count) => sum + count, 0)}
          tone="info"
          icon={<Users className="size-4" />}
        />
      </div>

      <div className={canManage ? "grid gap-4 lg:grid-cols-[1fr_360px]" : ""}>
        <div className="space-y-3">
          {elections.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Vote className="size-5" />}
                title="No elections yet"
                description={
                  canManage
                    ? "Create one using the panel on the right."
                    : "Elections will appear here when the school opens one."
                }
              />
            </Card>
          ) : null}

          {elections.map((election) => {
            const turnout = voted.get(election.id) ?? 0;
            const share = percentOf(turnout, election._count.voters);
            const isOpen =
              election.status === "OPEN" &&
              now >= election.opensAt &&
              now <= election.closesAt;
            const hasVoted = roll.get(election.id);

            return (
              <Card key={election.id}>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={election.status} />
                        <Badge tone="neutral">{humanise(election.kind)}</Badge>
                        {election.isSecret ? (
                          <Badge tone="info">Secret ballot</Badge>
                        ) : null}
                        {hasVoted === true ? (
                          <Badge tone="success">
                            <CheckCircle2 className="size-2.5" />
                            You voted
                          </Badge>
                        ) : null}
                        {hasVoted === false && isOpen ? (
                          <Badge tone="warning">Your vote is pending</Badge>
                        ) : null}
                      </div>
                      <Link
                        href={`/elections/${election.slug}`}
                        className="text-base font-semibold hover:text-[var(--primary)]"
                      >
                        {election.title}
                      </Link>
                      {election.description ? (
                        <p className="mt-0.5 max-w-xl text-sm text-[var(--text-muted)]">
                          {election.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-[var(--text-subtle)]">
                        {election._count.positions} position
                        {election._count.positions === 1 ? "" : "s"} ·{" "}
                        {isOpen
                          ? `Closes ${relativeTime(election.closesAt)}`
                          : election.status === "DRAFT" ||
                              election.status === "SCHEDULED"
                            ? `Opens ${formatDateTime(election.opensAt)}`
                            : `Closed ${relativeTime(election.closesAt)}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {canManage ? (
                        <Link
                          href={`/elections/${election.slug}/manage`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                        >
                          <Settings2 className="size-3.5" />
                          Manage
                        </Link>
                      ) : null}
                      <Link
                        href={`/elections/${election.slug}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-xs font-medium text-white hover:opacity-90"
                      >
                        {isOpen && hasVoted === false ? "Vote" : "View"}
                      </Link>
                    </div>
                  </div>

                  {election._count.voters > 0 ? (
                    <div className="mt-3">
                      <div className="mb-1 flex items-baseline justify-between text-xs">
                        <span className="text-[var(--text-muted)]">Turnout</span>
                        <span className="numeric">
                          {turnout} / {election._count.voters}
                          <span className="ml-1.5 text-[var(--text-subtle)]">
                            {share.toFixed(0)}%
                          </span>
                        </span>
                      </div>
                      <ProgressBar
                        value={share}
                        tone={share >= 50 ? "success" : share >= 25 ? "warning" : "primary"}
                        label={`Turnout ${share.toFixed(0)}%`}
                      />
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>

        {canManage ? (
          <div>
            <Card>
              <CardHeader
                title="New election"
                description="Created as a draft so candidates can be added before voting opens."
              />
              <ElectionForm />
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
