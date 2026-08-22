"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ClipboardCheck, Printer, Send, UserCheck, X } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { DECISIONS, STAGES, type Stage } from "@/lib/admission-rules";

import {
  decideApplicationAction,
  saveAssessmentAction,
  saveInterviewAction,
} from "./actions";

export type BoardRow = {
  id: string;
  studentId: string;
  name: string;
  admissionNo: string;
  levelName: string | null;
  source: string;
  siblingName: string | null;
  feePaid: boolean;
  papers: Array<{ paper: string; score: number | null; maxScore: number }>;
  average: number | null;
  recommendation: string | null;
  interviewNote: string | null;
  interviewAttendees: string | null;
  offerExpiresOn: string | null;
  waitlistRank: number | null;
  stage: Stage;
  /** What this viewer may do, already filtered by permission. */
  acts: string[];
};

const STAGE = new Map(STAGES.map((entry) => [entry.value, entry] as const));
const DECISION = new Map(DECISIONS.map((entry) => [entry.value, entry] as const));

/**
 * The intake, grouped by where each child stands.
 *
 * Lapsed offers lead. They are the only group somebody has to act on today: a
 * place is being held for a family who stopped answering, and nothing releases
 * it on its own — the school has to decide whether to ring them again or give
 * the seat away.
 */
export function PipelineBoard({
  rows,
  papers,
  today,
  mayLetter,
}: {
  rows: BoardRow[];
  /** The entrance papers this school sets. */
  papers: string[];
  today: string;
  /**
   * Whether this viewer may print the offer letter — the same pair the route
   * enforces. It was the one control on the row drawn from the stage alone,
   * so an assistant head, who holds read and interview and nothing else, was
   * shown exactly one button and it was the one that 403s.
   */
  mayLetter: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; what: "assess" | "interview" | "offer" } | null>(
    null,
  );

  const groups = useMemo(() => {
    const order: Stage[] = [
      "EXPIRED",
      "ACCEPTED",
      "OFFERED",
      "INTERVIEWED",
      "ASSESSED",
      "APPLIED",
      "WAITLISTED",
      "DECLINED",
      "ENROLLED",
      "WITHDRAWN",
    ];
    return order
      .map((stage) => ({ stage, rows: rows.filter((row) => row.stage === stage) }))
      .filter((group) => group.rows.length > 0);
  }, [rows]);

  async function act(id: string, what: string, extra?: Record<string, string>) {
    setBusy(`${id}:${what}`);
    setProblem(null);
    setDone(null);
    const data = new FormData();
    data.append("id", id);
    data.append("act", what);
    for (const [key, value] of Object.entries(extra ?? {})) data.append(key, value);
    const result = await decideApplicationAction(data);
    setBusy(null);
    if (result.error) setProblem(result.error);
    else {
      setDone(result.message ?? "Done.");
      setOpen(null);
      router.refresh();
    }
  }

  if (rows.length === 0) {
    return (
      <Alert tone="info" title="No applications yet">
        An applicant is a pupil record with the status Applicant. Admit one under
        Students, then start their application here — the entrance papers, the
        interview and the offer all hang off it.
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}

      {groups.map((group) => {
        const stage = STAGE.get(group.stage);
        return (
          <Card key={group.stage}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {stage?.label ?? group.stage}
                  <Badge tone={stage?.tone ?? "neutral"}>{group.rows.length}</Badge>
                </span>
              }
              description={stage?.description}
            />
            <CardBody>
              <ul className="divide-y divide-[var(--border)]">
                {group.rows.map((row) => (
                  <li key={row.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text)]">
                          <Link
                            href={`/students/${row.studentId}`}
                            className="font-medium hover:text-[var(--primary)]"
                          >
                            {row.name}
                          </Link>
                          <span className="numeric text-xs text-[var(--text-subtle)]">
                            {row.admissionNo}
                          </span>
                          {row.levelName ? (
                            <Badge tone="neutral">{row.levelName}</Badge>
                          ) : null}
                          {row.waitlistRank ? (
                            <Badge tone="warning">#{row.waitlistRank}</Badge>
                          ) : null}
                          {row.siblingName ? (
                            <Badge tone="info">sibling: {row.siblingName}</Badge>
                          ) : null}
                          {row.feePaid ? null : (
                            <Badge tone="warning">Fee unpaid</Badge>
                          )}
                        </p>

                        <p className="text-xs text-[var(--text-subtle)]">
                          {[
                            row.average !== null
                              ? `Entrance ${row.average}%`
                              : row.papers.length
                                ? `${row.papers.length} paper${row.papers.length === 1 ? "" : "s"} set, unmarked`
                                : "No entrance papers",
                            row.recommendation
                              ? (DECISION.get(row.recommendation as "RECOMMEND")?.label ??
                                row.recommendation)
                              : "Not interviewed",
                            row.offerExpiresOn ? `Offer lapses ${row.offerExpiresOn}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>

                        {row.interviewNote ? (
                          // Written by the interviewer and, until now, stored
                          // and read back nowhere at all.
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            &ldquo;{row.interviewNote}&rdquo;
                            {row.interviewAttendees ? (
                              <span className="text-[var(--text-subtle)]">
                                {" "}
                                — {row.interviewAttendees}
                              </span>
                            ) : null}
                          </p>
                        ) : null}

                        {row.papers.length ? (
                          <p className="numeric mt-0.5 text-xs text-[var(--text-subtle)]">
                            {row.papers
                              .map(
                                (paper) =>
                                  `${paper.paper} ${paper.score ?? "—"}/${paper.maxScore}`,
                              )
                              .join("   ")}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {row.acts.includes("ASSESS") ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setOpen({ id: row.id, what: "assess" })}
                          >
                            <ClipboardCheck className="size-4" />
                            Mark
                          </Button>
                        ) : null}
                        {row.acts.includes("INTERVIEW") ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setOpen({ id: row.id, what: "interview" })}
                          >
                            <UserCheck className="size-4" />
                            Interview
                          </Button>
                        ) : null}
                        {row.acts.includes("OFFER") ? (
                          <Button
                            size="sm"
                            onClick={() => setOpen({ id: row.id, what: "offer" })}
                          >
                            <Send className="size-4" />
                            {row.stage === "OFFERED" || row.stage === "EXPIRED"
                              ? "Re-offer"
                              : "Offer a place"}
                          </Button>
                        ) : null}
                        {mayLetter &&
                        (row.stage === "OFFERED" ||
                          row.stage === "EXPIRED" ||
                          row.stage === "ACCEPTED") ? (
                          <a
                            href={`/api/admissions/offer?id=${row.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-[var(--radius)] border border-[var(--border)] px-2.5 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                          >
                            <Printer className="size-4" />
                            Letter
                          </a>
                        ) : null}
                        {row.acts.includes("ACCEPT") ? (
                          <Button
                            size="sm"
                            disabled={busy !== null}
                            onClick={() => act(row.id, "ACCEPT")}
                          >
                            <Check className="size-4" />
                            Accepted
                          </Button>
                        ) : null}
                        {row.acts.includes("WAITLIST") ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy !== null}
                            onClick={() => act(row.id, "WAITLIST")}
                          >
                            Waiting list
                          </Button>
                        ) : null}
                        {row.acts.includes("DECLINE") ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy !== null}
                            onClick={() => act(row.id, "DECLINE")}
                          >
                            <X className="size-4" />
                            Declined
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {open?.id === row.id ? (
                      <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                        {open.what === "assess" ? (
                          <AssessForm
                            applicationId={row.id}
                            papers={papers}
                            today={today}
                            onDone={() => {
                              setOpen(null);
                              router.refresh();
                            }}
                          />
                        ) : open.what === "interview" ? (
                          <InterviewForm
                            applicationId={row.id}
                            today={today}
                            onDone={() => {
                              setOpen(null);
                              router.refresh();
                            }}
                          />
                        ) : (
                          <OfferForm
                            busy={busy !== null}
                            onOffer={(expires, note) =>
                              act(row.id, "OFFER", {
                                offerExpiresOn: expires,
                                note,
                              })
                            }
                            onCancel={() => setOpen(null)}
                          />
                        )}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

function AssessForm({
  applicationId,
  papers,
  today,
  onDone,
}: {
  applicationId: string;
  papers: string[];
  today: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        data.append("applicationId", applicationId);
        setBusy(true);
        setProblem(null);
        const result = await saveAssessmentAction(data);
        setBusy(false);
        if (result.error) setProblem(result.error);
        else onDone();
      }}
    >
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Paper" htmlFor={`p-${applicationId}`} required>
          <Select id={`p-${applicationId}`} name="paper" required>
            {papers.map((paper) => (
              <option key={paper} value={paper}>
                {paper}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Score" htmlFor={`s-${applicationId}`}>
          <Input id={`s-${applicationId}`} name="score" inputMode="decimal" />
        </Field>
        <Field label="Out of" htmlFor={`m-${applicationId}`}>
          <Input id={`m-${applicationId}`} name="maxScore" inputMode="decimal" defaultValue="100" />
        </Field>
        <Field label="Sat on" htmlFor={`d-${applicationId}`}>
          <Input id={`d-${applicationId}`} name="satOn" type="date" defaultValue={today} />
        </Field>
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Saving…" : "Record the mark"}
      </Button>
    </form>
  );
}

function InterviewForm({
  applicationId,
  today,
  onDone,
}: {
  applicationId: string;
  today: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        data.append("applicationId", applicationId);
        setBusy(true);
        setProblem(null);
        const result = await saveInterviewAction(data);
        setBusy(false);
        if (result.error) setProblem(result.error);
        else onDone();
      }}
    >
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Held on" htmlFor={`ih-${applicationId}`} required>
          <Input id={`ih-${applicationId}`} name="heldOn" type="date" required defaultValue={today} />
        </Field>
        <Field
          label="Who came"
          htmlFor={`ia-${applicationId}`}
          hint="A school interviews the family as much as the child."
        >
          <Input id={`ia-${applicationId}`} name="attendees" placeholder="Mother and grandmother" />
        </Field>
        <Field label="Decision" htmlFor={`id-${applicationId}`} required>
          <Select id={`id-${applicationId}`} name="decision" required defaultValue="RECOMMEND">
            {DECISIONS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Notes" htmlFor={`in-${applicationId}`}>
        <Textarea id={`in-${applicationId}`} name="notes" rows={2} />
      </Field>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Saving…" : "Record the interview"}
      </Button>
    </form>
  );
}

function OfferForm({
  busy,
  onOffer,
  onCancel,
}: {
  busy: boolean;
  onOffer: (expires: string, note: string) => void;
  onCancel: () => void;
}) {
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="space-y-3">
      <Field
        label="Offer lapses on"
        htmlFor="offer-expiry"
        hint="Leave empty and the place is held until somebody says otherwise — which is how a seat ends up held all year by a family who chose elsewhere in March."
      >
        <Input
          id="offer-expiry"
          type="date"
          value={expires}
          onChange={(event) => setExpires(event.target.value)}
        />
      </Field>
      <Field label="Note on the letter" htmlFor="offer-note">
        <Textarea
          id="offer-note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Subject to the deposit being paid by the date above."
        />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => onOffer(expires, note)}>
          <Send className="size-4" />
          {busy ? "Offering…" : "Offer the place"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
