import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, CheckCircle2, Clock, Trophy, Users } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  ProgressBar,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { percentOf } from "@/lib/money";
import { formatDateTime, relativeTime } from "@/lib/utils";

import { BallotPaper, type BallotPosition } from "./ballot";

export const dynamic = "force-dynamic";
/** Live tallies must not be served from a cache. */
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const election = await db.election.findUnique({
    where: { slug },
    select: { title: true },
  });
  return { title: election?.title ?? "Election" };
}

export default async function ElectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requirePermission(["election.read", "election.vote"]);
  const { slug } = await params;

  const election = await db.election.findUnique({
    where: { slug },
    include: {
      positions: {
        orderBy: { sortKey: "asc" },
        include: {
          candidates: {
            where: { status: "APPROVED" },
            orderBy: { ballotOrder: "asc" },
          },
        },
      },
      _count: { select: { ballots: true, voters: true } },
    },
  });

  if (!election) notFound();

  const [roll, turnout] = await Promise.all([
    db.voterRoll.findUnique({
      where: { electionId_userId: { electionId: election.id, userId: user.id } },
      select: { hasVoted: true, votedAt: true },
    }),
    db.voterRoll.count({ where: { electionId: election.id, hasVoted: true } }),
  ]);

  const now = new Date();
  const isOpen =
    election.status === "OPEN" && now >= election.opensAt && now <= election.closesAt;
  const canVote = Boolean(roll) && !roll?.hasVoted && isOpen && userCan(user, "election.vote");

  // Results are visible while open only if the election says so; otherwise
  // they appear once published, so a running tally cannot sway later voters.
  const showResults =
    election.status === "PUBLISHED" ||
    (election.showLiveResults && (isOpen || election.status === "CLOSED")) ||
    userCan(user, "election.manage");


  return (
    <>
      <PageHeader
        title={election.title}
        description={election.description ?? undefined}
        breadcrumb={
          <Link href="/elections" className="hover:text-[var(--text)]">
            Elections
          </Link>
        }
        action={<StatusBadge status={election.status} />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Eligible voters"
          value={election._count.voters}
          tone="info"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Turnout"
          value={`${percentOf(turnout, election._count.voters).toFixed(0)}%`}
          hint={`${turnout} of ${election._count.voters}`}
          tone={percentOf(turnout, election._count.voters) >= 50 ? "success" : "warning"}
          icon={<BarChart3 className="size-4" />}
        />
        <StatCard
          label="Ballots cast"
          value={election._count.ballots}
          tone="violet"
          icon={<CheckCircle2 className="size-4" />}
        />
        <StatCard
          label={isOpen ? "Closes" : "Closed"}
          value={relativeTime(election.closesAt)}
          hint={formatDateTime(election.closesAt)}
          tone={isOpen ? "teal" : "neutral"}
          icon={<Clock className="size-4" />}
        />
      </div>

      {election.instructions && canVote ? (
        <Alert tone="info" className="mb-4">
          {election.instructions}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ballot */}
        <div>
          {canVote ? (
            <BallotPaper
              electionId={election.id}
              allowAbstain={election.allowAbstain}
              isSecret={election.isSecret}
              positions={election.positions.map<BallotPosition>((position) => ({
                id: position.id,
                title: position.title,
                description: position.description,
                maxSelections: position.maxSelections,
                candidates: position.candidates.map((candidate) => ({
                  id: candidate.id,
                  displayName: candidate.displayName,
                  slogan: candidate.slogan,
                  manifesto: candidate.manifesto,
                  photoUrl: candidate.photoUrl,
                })),
              }))}
            />
          ) : (
            <Card>
              <CardHeader title="Voting" />
              <CardBody>
                {!roll ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    You are not on the roll for this election.
                  </p>
                ) : roll.hasVoted ? (
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--success)]" />
                    <div>
                      <p className="text-sm font-medium">You have voted</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Recorded {relativeTime(roll.votedAt)}. A ballot cannot be
                        changed once cast.
                      </p>
                    </div>
                  </div>
                ) : election.status === "DRAFT" || election.status === "SCHEDULED" ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    Voting opens {formatDateTime(election.opensAt)}.
                  </p>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Voting has closed.
                  </p>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        {/* Results */}
        <div className="space-y-4">
          {showResults ? (
            election.positions.map((position) => {
              const votes = position.candidates.reduce(
                (sum, candidate) => sum + candidate.voteCount,
                0,
              );
              const leader = [...position.candidates].sort(
                (a, b) => b.voteCount - a.voteCount,
              )[0];

              return (
                <Card key={position.id}>
                  <CardHeader
                    title={position.title}
                    description={`${votes} vote${votes === 1 ? "" : "s"} cast`}
                    action={
                      election.status === "PUBLISHED" && leader && leader.voteCount > 0 ? (
                        <Badge tone="success">
                          <Trophy className="size-2.5" />
                          {leader.displayName}
                        </Badge>
                      ) : null
                    }
                  />
                  <CardBody className="space-y-3">
                    {[...position.candidates]
                      .sort((a, b) => b.voteCount - a.voteCount)
                      .map((candidate) => {
                        const share = percentOf(candidate.voteCount, votes);
                        const isLeader =
                          leader?.id === candidate.id && candidate.voteCount > 0;
                        return (
                          <div key={candidate.id}>
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                              <span
                                className={`text-sm ${isLeader ? "font-semibold" : ""}`}
                              >
                                {candidate.displayName}
                              </span>
                              <span className="numeric text-sm">
                                {candidate.voteCount}
                                <span className="ml-1.5 text-xs text-[var(--text-subtle)]">
                                  {share.toFixed(0)}%
                                </span>
                              </span>
                            </div>
                            <ProgressBar
                              value={share}
                              tone={isLeader ? "success" : "primary"}
                              label={`${candidate.displayName}: ${share.toFixed(0)}%`}
                            />
                          </div>
                        );
                      })}

                    {position.candidates.length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">
                        No approved candidates.
                      </p>
                    ) : null}
                  </CardBody>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardHeader title="Results" />
              <CardBody>
                <p className="text-sm text-[var(--text-muted)]">
                  Results are hidden until voting closes and they are published, so a
                  running tally cannot influence people who have not yet voted.
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
