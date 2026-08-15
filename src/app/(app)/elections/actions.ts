"use server";

import { revalidatePath } from "next/cache";

import { authorize, clientIp } from "@/lib/auth";
import { generateCode, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { slugify } from "@/lib/utils";

export type BallotState = {
  ok?: boolean;
  error?: string;
  receipt?: string;
};

/**
 * Casts a ballot.
 *
 * The secrecy model: `VoterRoll` records *that* a person voted, `Ballot` and
 * `Vote` record *what* was chosen, and in a secret election the two are never
 * linked. Both are written in one transaction, so a vote cannot be counted
 * without the roll being marked and vice versa — that pairing is what makes
 * double voting impossible without making the ballot traceable.
 */
export async function castBallotAction(
  _previous: BallotState,
  formData: FormData,
): Promise<BallotState> {
  let user;
  try {
    user = await authorize("election.vote");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const electionId = String(formData.get("electionId") ?? "");
  if (!electionId) return { error: "Missing election." };

  const election = await db.election.findUnique({
    where: { id: electionId },
    select: {
      id: true,
      status: true,
      opensAt: true,
      closesAt: true,
      isSecret: true,
      allowAbstain: true,
      positions: {
        select: {
          id: true,
          title: true,
          maxSelections: true,
          candidates: { select: { id: true, status: true } },
        },
      },
    },
  });

  if (!election) return { error: "Election not found." };

  const now = new Date();
  if (election.status !== "OPEN" || now < election.opensAt || now > election.closesAt) {
    return { error: "Voting is not open." };
  }

  const roll = await db.voterRoll.findUnique({
    where: { electionId_userId: { electionId, userId: user.id } },
    select: { hasVoted: true, weight: true },
  });

  if (!roll) return { error: "You are not on the roll for this election." };
  if (roll.hasVoted) return { error: "You have already voted in this election." };

  // Validate every selection before writing anything.
  const selections: Array<{ positionId: string; candidateId: string | null }> = [];

  for (const position of election.positions) {
    const raw = formData.getAll(`position:${position.id}`).map(String).filter(Boolean);
    const chosen = raw.filter((value) => value !== "ABSTAIN");

    if (chosen.length > position.maxSelections) {
      return {
        error: `Choose at most ${position.maxSelections} candidate${
          position.maxSelections === 1 ? "" : "s"
        } for ${position.title}.`,
      };
    }

    if (chosen.length === 0) {
      if (!election.allowAbstain) {
        return { error: `Make a selection for ${position.title}.` };
      }
      selections.push({ positionId: position.id, candidateId: null });
      continue;
    }

    for (const candidateId of chosen) {
      const candidate = position.candidates.find((entry) => entry.id === candidateId);
      if (!candidate || candidate.status !== "APPROVED") {
        return { error: "That candidate is not standing." };
      }
      selections.push({ positionId: position.id, candidateId });
    }
  }

  const receipt = generateCode(8);
  const headerList = await headers();
  const ip = clientIp(headerList);

  try {
    await db.$transaction(async (tx) => {
      const ballot = await tx.ballot.create({
        data: {
          electionId,
          // A secret ballot stores no voter; the roll alone proves participation.
          userId: election.isSecret ? null : user.id,
          receiptCode: receipt,
          // Hashed, so a duplicate-source investigation is possible without
          // storing an address that could identify a voter.
          ipHash: ip ? sha256(ip) : null,
        },
      });

      await tx.vote.createMany({
        data: selections.map((selection) => ({
          ballotId: ballot.id,
          positionId: selection.positionId,
          candidateId: selection.candidateId,
          isAbstention: selection.candidateId === null,
          weight: roll.weight,
        })),
      });

      // Denormalised tally, incremented inside the same transaction so the
      // live count can never disagree with the stored votes.
      for (const selection of selections) {
        if (!selection.candidateId) continue;
        await tx.candidate.update({
          where: { id: selection.candidateId },
          data: { voteCount: { increment: roll.weight } },
        });
      }

      await tx.voterRoll.update({
        where: { electionId_userId: { electionId, userId: user.id } },
        data: { hasVoted: true, votedAt: new Date() },
      });
    });
  } catch (error) {
    return { error: (error as Error).message };
  }

  revalidatePath(`/elections`);
  return { ok: true, receipt };
}

// -----------------------------------------------------------------------------
// Administration
// -----------------------------------------------------------------------------

export type ElectionState = { ok?: boolean; error?: string; id?: string };

export async function createElectionAction(
  _previous: ElectionState,
  formData: FormData,
): Promise<ElectionState> {
  let user;
  try {
    user = await authorize("election.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const title = String(formData.get("title") ?? "").trim();
  const opensAt = String(formData.get("opensAt") ?? "");
  const closesAt = String(formData.get("closesAt") ?? "");

  if (!title) return { error: "Give the election a title." };
  if (!opensAt || !closesAt) return { error: "Set when voting opens and closes." };
  if (new Date(closesAt) <= new Date(opensAt)) {
    return { error: "Voting must close after it opens." };
  }

  const positions = String(formData.get("positions") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!positions.length) return { error: "List at least one position." };

  const election = await db.election.create({
    data: {
      title,
      slug: `${slugify(title)}-${generateCode(4).toLowerCase()}`,
      description: String(formData.get("description") ?? "") || null,
      kind: String(formData.get("kind") ?? "SRC"),
      status: "DRAFT",
      opensAt: new Date(opensAt),
      closesAt: new Date(closesAt),
      eligiblePortals: formData.getAll("eligiblePortals").map(String) as never,
      isSecret: formData.get("isSecret") === "on",
      showLiveResults: formData.get("showLiveResults") === "on",
      allowAbstain: formData.get("allowAbstain") === "on",
      instructions: String(formData.get("instructions") ?? "") || null,
      createdById: user.id,
      positions: {
        create: positions.map((title, index) => ({
          title,
          sortKey: index + 1,
          maxSelections: 1,
          seats: 1,
        })),
      },
    },
  });

  revalidatePath("/elections");
  return { ok: true, id: election.id };
}

/**
 * Opens voting and builds the roll.
 *
 * The roll is fixed at this moment rather than evaluated per vote, so someone
 * enrolled mid-election cannot vote and the turnout denominator does not move
 * underneath the results.
 */
export async function openElectionAction(electionId: string) {
  const user = await authorize("election.manage");

  const election = await db.election.findUnique({
    where: { id: electionId },
    select: { eligiblePortals: true, eligibleClassIds: true },
  });
  if (!election) return;

  const voters = await db.user.findMany({
    where: {
      status: "ACTIVE",
      portal: { in: election.eligiblePortals },
      ...(election.eligibleClassIds.length
        ? {
            student: {
              enrollments: {
                some: { classSectionId: { in: election.eligibleClassIds } },
              },
            },
          }
        : {}),
    },
    select: { id: true },
  });

  await db.$transaction([
    db.voterRoll.deleteMany({ where: { electionId, hasVoted: false } }),
    db.voterRoll.createMany({
      data: voters.map((voter) => ({ electionId, userId: voter.id })),
      skipDuplicates: true,
    }),
    db.election.update({
      where: { id: electionId },
      data: { status: "OPEN" },
    }),
  ]);

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "election.open",
      entity: "Election",
      entityId: electionId,
      summary: `Opened voting to ${voters.length} eligible voters`,
    },
  });

  revalidatePath("/elections");
}

export async function closeElectionAction(electionId: string) {
  const user = await authorize("election.manage");
  await db.election.update({ where: { id: electionId }, data: { status: "CLOSED" } });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "election.close",
      entity: "Election",
      entityId: electionId,
      summary: "Closed voting",
    },
  });
  revalidatePath("/elections");
}

export async function publishResultsAction(electionId: string) {
  const user = await authorize("election.result.publish");
  await db.election.update({
    where: { id: electionId },
    data: { status: "PUBLISHED", resultsPublishedAt: new Date() },
  });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "election.result.publish",
      entity: "Election",
      entityId: electionId,
      summary: "Published results",
    },
  });
  revalidatePath("/elections");
}

export async function addCandidateAction(formData: FormData) {
  await authorize("election.manage");

  const positionId = String(formData.get("positionId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!positionId || !displayName) return;

  const count = await db.candidate.count({ where: { positionId } });

  await db.candidate.create({
    data: {
      positionId,
      studentId: String(formData.get("studentId") ?? "") || null,
      displayName,
      slogan: String(formData.get("slogan") ?? "") || null,
      manifesto: String(formData.get("manifesto") ?? "") || null,
      ballotOrder: count + 1,
      status: "APPROVED",
    },
  });

  revalidatePath("/elections");
}
