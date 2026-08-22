"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, DoorOpen, LogIn, Plus, Printer, X } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Textarea,
} from "@/components/ui";
import { EXEAT_STATUSES, isOverdue } from "@/lib/boarding-rules";

import {
  decideExeatAction,
  requestExeatAction,
  type BoardingState,
} from "../actions";

export type ExeatRow = {
  id: string;
  status: string;
  studentName: string;
  admissionNo: string;
  houseName: string | null;
  reason: string;
  destination: string;
  /** ISO, for the arithmetic. */
  dueBackAtISO: string;
  departsAt: string;
  dueBackAt: string;
  releasedToName: string;
  releasedToPhone: string | null;
  relationship: string | null;
  signedOutAt: string | null;
  signedInAt: string | null;
  decisionNote: string | null;
  /** What this viewer may turn it into. */
  allowed: string[];
};

const TONE = new Map(EXEAT_STATUSES.map((entry) => [entry.value, entry] as const));

/**
 * The gate.
 *
 * Built to be used standing up, on a phone, by whoever is at the desk when a
 * car pulls in. The name of the person collecting is the largest thing on each
 * row, because that is what is being checked — the child is standing there;
 * the question is whether this adult is the one written down.
 */
export function ExeatDesk({
  rows,
  students,
  canRequest,
  now,
}: {
  rows: ExeatRow[];
  students: SelectOption[];
  canRequest: boolean;
  /** From the server, so the browser's clock cannot disagree about overdue. */
  now: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const at = new Date(now);

  async function decide(id: string, status: string) {
    setBusy(`${id}:${status}`);
    setProblem(null);
    setDone(null);
    const data = new FormData();
    data.append("id", id);
    data.append("status", status);
    const result = await decideExeatAction(data);
    setBusy(null);
    if (result.error) setProblem(result.error);
    else {
      setDone(result.message ?? "Done.");
      router.refresh();
    }
  }

  const out = rows.filter((row) => row.status === "OUT");
  const pending = rows.filter((row) => row.status === "REQUESTED");
  const ready = rows.filter((row) => row.status === "APPROVED");
  const closed = rows.filter((row) => row.status === "RETURNED" || row.status === "CANCELLED");

  return (
    <div className="space-y-5">
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}

      {canRequest ? (
        composing ? (
          <ExeatForm students={students} onDone={() => setComposing(false)} />
        ) : (
          <Button size="sm" onClick={() => setComposing(true)}>
            <Plus className="size-4" />
            Record a leave-out
          </Button>
        )
      ) : null}

      <Group
        title="Off the premises"
        description="Signed out. The school does not have these children."
        rows={out}
        empty="Nobody is out."
        busy={busy}
        onDecide={decide}
        now={at}
      />

      <Group
        title="At the gate"
        description="Approved and still here. Sign them out when they are collected."
        rows={ready}
        empty="Nobody is waiting to leave."
        busy={busy}
        onDecide={decide}
        now={at}
      />

      <Group
        title="Waiting on approval"
        description="The gate will not release these."
        rows={pending}
        empty="Nothing waiting."
        busy={busy}
        onDecide={decide}
        now={at}
      />

      {closed.length ? (
        <Group
          title="Finished"
          description="Back, or never went."
          rows={closed.slice(0, 40)}
          empty=""
          busy={busy}
          onDecide={decide}
          now={at}
        />
      ) : null}
    </div>
  );
}

function Group({
  title,
  description,
  rows,
  empty,
  busy,
  onDecide,
  now,
}: {
  title: string;
  description: string;
  rows: ExeatRow[];
  empty: string;
  busy: string | null;
  onDecide: (id: string, status: string) => void;
  now: Date;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--text-subtle)]">{empty}</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((row) => {
              const status = TONE.get(row.status as (typeof EXEAT_STATUSES)[number]["value"]);
              // Against the ISO value, never the formatted one. "15 Aug 2026,
              // 18:00" happens to re-parse in V8 and happens not to in other
              // engines, and an hour that depends on which browser is at the
              // desk is not an hour.
              const late = isOverdue(
                { status: row.status, dueBackAt: row.dueBackAtISO },
                now,
              );

              return (
                <li key={row.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--text)]">
                        {row.studentName}
                        <span className="numeric text-xs font-normal text-[var(--text-subtle)]">
                          {row.admissionNo}
                        </span>
                        {row.houseName ? (
                          <Badge tone="neutral">{row.houseName}</Badge>
                        ) : null}
                        {late ? <Badge tone="danger">Overdue</Badge> : null}
                        {!late && status ? (
                          <Badge tone={status.tone}>{status.label}</Badge>
                        ) : null}
                      </p>

                      {/* The name being checked at the gate, set large. */}
                      <p className="mt-1 text-[var(--text)]">
                        <span className="text-xs text-[var(--text-subtle)]">
                          Released to{" "}
                        </span>
                        <span className="font-medium">{row.releasedToName}</span>
                        {row.relationship ? (
                          <span className="text-xs text-[var(--text-subtle)]">
                            {" "}
                            · {row.relationship}
                          </span>
                        ) : null}
                        {row.releasedToPhone ? (
                          <a
                            href={`tel:${row.releasedToPhone}`}
                            className="numeric ml-2 text-sm text-[var(--primary)]"
                          >
                            {row.releasedToPhone}
                          </a>
                        ) : null}
                      </p>

                      <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                        {row.destination} · {row.reason} · out {row.departsAt}, back{" "}
                        {row.dueBackAt}
                        {row.signedOutAt ? ` · left ${row.signedOutAt}` : ""}
                        {row.signedInAt ? ` · returned ${row.signedInAt}` : ""}
                      </p>

                      {row.decisionNote ? (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {row.decisionNote}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {row.allowed.includes("APPROVED") ? (
                        <Button
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => onDecide(row.id, "APPROVED")}
                        >
                          <Check className="size-4" />
                          Approve
                        </Button>
                      ) : null}
                      {row.status === "APPROVED" || row.status === "OUT" ? (
                        <a
                          href={`/api/boarding/exeat?id=${row.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-[var(--radius)] border border-[var(--border)] px-2.5 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                        >
                          <Printer className="size-4" />
                          Pass
                        </a>
                      ) : null}
                      {row.allowed.includes("OUT") ? (
                        <Button
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => onDecide(row.id, "OUT")}
                        >
                          <DoorOpen className="size-4" />
                          {busy === `${row.id}:OUT` ? "Signing out…" : "Sign out"}
                        </Button>
                      ) : null}
                      {row.allowed.includes("RETURNED") ? (
                        <Button
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => onDecide(row.id, "RETURNED")}
                        >
                          <LogIn className="size-4" />
                          {busy === `${row.id}:RETURNED` ? "Signing in…" : "Sign back in"}
                        </Button>
                      ) : null}
                      {row.allowed.includes("CANCELLED") ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => onDecide(row.id, "CANCELLED")}
                        >
                          <X className="size-4" />
                          Not going
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function ExeatForm({
  students,
  onDone,
}: {
  students: SelectOption[];
  onDone: () => void;
}) {
  const [state, action] = useActionState<BoardingState, FormData>(requestExeatAction, {});

  return (
    <Card>
      <CardHeader
        title="Record a leave-out"
        description="Who is going, where, and who is collecting them."
        action={
          <Button size="sm" variant="ghost" onClick={onDone}>
            <X className="size-4" />
          </Button>
        }
      />
      <CardBody>
        <form action={action} className="space-y-3">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

          <Field label="Boarder" htmlFor="ex-student" required>
            <SearchableSelect
              id="ex-student"
              name="studentId"
              options={students}
              placeholder="Search by name or admission number"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Where are they going" htmlFor="ex-dest" required>
              <Input id="ex-dest" name="destination" required placeholder="Home, Tema" />
            </Field>
            <Field label="Why" htmlFor="ex-reason" required>
              <Input id="ex-reason" name="reason" required placeholder="Mid-term break" />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Leaving" htmlFor="ex-out" required>
              <Input id="ex-out" name="departsAt" type="datetime-local" required />
            </Field>
            <Field label="Due back" htmlFor="ex-back" required>
              <Input id="ex-back" name="dueBackAt" type="datetime-local" required />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Collected by"
              htmlFor="ex-by"
              required
              hint="The name the gate will check."
            >
              <Input id="ex-by" name="releasedToName" required />
            </Field>
            <Field label="Their phone" htmlFor="ex-phone">
              <Input id="ex-phone" name="releasedToPhone" inputMode="tel" />
            </Field>
            <Field label="Relationship" htmlFor="ex-rel">
              <Input id="ex-rel" name="relationship" placeholder="Uncle" />
            </Field>
          </div>

          <Field label="Notes" htmlFor="ex-notes">
            <Textarea id="ex-notes" name="notes" rows={2} />
          </Field>

          <Button type="submit" size="sm">
            Record it
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
