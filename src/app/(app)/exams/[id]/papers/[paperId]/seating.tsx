"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Armchair, Check, UserMinus, UserPlus, X } from "lucide-react";

import { Alert, Badge, Button, CheckboxField, Field, Select } from "@/components/ui";

import {
  allocateSeatsAction,
  markSeatAction,
  setInvigilatorAction,
} from "../../../actions";

export type SeatRow = {
  id: string;
  seatNo: string;
  venue: string | null;
  candidateNo: string;
  name: string;
  className: string;
  status: string;
  remark: string | null;
};

/**
 * Laying out the hall.
 *
 * Halls are filled in the order they are ticked, so the order matters and the
 * checkboxes keep it. Candidates are dealt out by class in rotation, which is
 * why the result is worth looking at: a hall seated by class puts thirty
 * pupils who sat through the same lessons in one unbroken block.
 */
export function Allocate({
  paperId,
  venues,
  seated,
  locked,
}: {
  paperId: string;
  venues: Array<{ id: string; name: string; capacity: number }>;
  seated: number;
  locked: boolean;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const capacity = chosen.reduce(
    (sum, id) => sum + (venues.find((venue) => venue.id === id)?.capacity ?? 0),
    0,
  );

  async function allocate() {
    setBusy(true);
    setProblem(null);
    setDone(null);
    const data = new FormData();
    data.append("paperId", paperId);
    // Appended in the order they were ticked, because that is the order the
    // halls fill and the server keeps it.
    for (const id of chosen) data.append("venueIds", id);
    const result = await allocateSeatsAction(data);
    setBusy(false);
    if (result.error) setProblem(result.error);
    else {
      setDone(result.message ?? "Seated.");
      router.refresh();
    }
  }

  if (locked) {
    return (
      <Alert tone="info">
        The register has been marked, so the seating is now a record of where people
        actually sat rather than a plan. It cannot be laid out again.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}

      {venues.length === 0 ? (
        <p className="text-sm text-[var(--text-subtle)]">
          No halls are set up. Add one before seating anybody.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {venues.map((venue) => {
              const at = chosen.indexOf(venue.id);
              return (
                <CheckboxField
                  key={venue.id}
                  label={
                    <span className="flex items-center gap-2">
                      {venue.name}
                      {at >= 0 ? <Badge tone="primary">{at + 1}</Badge> : null}
                    </span>
                  }
                  description={`Seats ${venue.capacity}`}
                  checked={at >= 0}
                  onChange={() =>
                    setChosen((current) =>
                      current.includes(venue.id)
                        ? current.filter((id) => id !== venue.id)
                        : [...current, venue.id],
                    )
                  }
                />
              );
            })}
          </div>

          <p className="text-xs text-[var(--text-subtle)]">
            {chosen.length
              ? `${capacity} seats, filled in the order ticked.`
              : "Tick the halls in the order they should fill."}
          </p>

          <Button size="sm" disabled={busy || chosen.length === 0} onClick={allocate}>
            <Armchair className="size-4" />
            {busy ? "Seating…" : seated ? "Lay it out again" : "Allocate seats"}
          </Button>

          {seated > 0 ? (
            <p className="text-xs text-[var(--text-subtle)]">
              This replaces the whole allocation. A partial re-seat would leave two hall
              lists in circulation that disagree.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/** The invigilation roster for one paper. */
export function Invigilators({
  paperId,
  staff,
  current,
  canManage,
}: {
  paperId: string;
  staff: Array<{ id: string; name: string }>;
  current: Array<{ staffId: string; name: string; role: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [staffId, setStaffId] = useState("");
  const [role, setRole] = useState("ASSISTANT");

  const already = new Set(current.map((one) => one.staffId));
  const available = staff.filter((person) => !already.has(person.id));

  async function change(next: { staffId: string; role?: string; remove?: boolean }) {
    setBusy(true);
    setProblem(null);
    const data = new FormData();
    data.append("paperId", paperId);
    data.append("staffId", next.staffId);
    if (next.role) data.append("role", next.role);
    if (next.remove) data.append("remove", "1");
    const result = await setInvigilatorAction(data);
    setBusy(false);
    if (result.error) setProblem(result.error);
    else {
      setStaffId("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      {problem ? <Alert tone="danger">{problem}</Alert> : null}

      {current.length === 0 ? (
        <p className="text-sm text-[var(--text-subtle)]">
          Nobody is watching this paper yet.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {current.map((one) => (
            <li key={one.staffId} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">
                {one.name}
              </span>
              <Badge tone={one.role === "CHIEF" ? "primary" : "neutral"}>
                {one.role === "CHIEF" ? "Chief" : "Assisting"}
              </Badge>
              {canManage ? (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${one.name}`}
                  onClick={() => change({ staffId: one.staffId, remove: true })}
                  className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--danger)]"
                >
                  <UserMinus className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className="space-y-2">
          <Field label="Add somebody" htmlFor="inv-staff">
            <Select
              id="inv-staff"
              value={staffId}
              onChange={(event) => setStaffId(event.target.value)}
            >
              <option value="">Choose…</option>
              {available.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="As" htmlFor="inv-role">
            <Select id="inv-role" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="ASSISTANT">Assisting</option>
              <option value="CHIEF">Chief invigilator</option>
            </Select>
          </Field>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !staffId}
            onClick={() => change({ staffId, role })}
          >
            <UserPlus className="size-4" />
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The hall register.
 *
 * Marked in the hall, on a phone, by whoever is invigilating — so it is two
 * taps per candidate and nothing else. Absences are what matter: a script that
 * never arrives is chased against this list.
 */
export function Register({ seats, canMark }: { seats: SeatRow[]; canMark: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function mark(seatId: string, status: string) {
    setBusy(seatId);
    setProblem(null);
    const data = new FormData();
    data.append("seatId", seatId);
    data.append("status", status);
    const result = await markSeatAction(data);
    setBusy(null);
    if (result.error) setProblem(result.error);
    else router.refresh();
  }

  if (seats.length === 0) {
    return (
      <p className="text-sm text-[var(--text-subtle)]">
        Nobody is seated yet, so there is no register to mark.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {problem ? <Alert tone="danger">{problem}</Alert> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="px-2 py-2 font-medium text-[var(--text-muted)]">Seat</th>
              <th className="px-2 py-2 font-medium text-[var(--text-muted)]">Index</th>
              <th className="px-2 py-2 font-medium text-[var(--text-muted)]">Candidate</th>
              <th className="px-2 py-2 font-medium text-[var(--text-muted)]">Class</th>
              <th className="px-2 py-2 text-right font-medium text-[var(--text-muted)]">
                {canMark ? "Present?" : "Status"}
              </th>
            </tr>
          </thead>
          <tbody>
            {seats.map((seat) => (
              <tr key={seat.id} className="border-b border-[var(--border)] last:border-0">
                <td className="numeric px-2 py-1.5 whitespace-nowrap">{seat.seatNo}</td>
                <td className="numeric px-2 py-1.5 whitespace-nowrap text-[var(--text-muted)]">
                  {seat.candidateNo}
                </td>
                <td className="px-2 py-1.5">{seat.name}</td>
                <td className="px-2 py-1.5 text-[var(--text-muted)]">{seat.className}</td>
                <td className="px-2 py-1.5 text-right">
                  {canMark ? (
                    <span className="inline-flex gap-1">
                      <button
                        type="button"
                        disabled={busy !== null}
                        aria-label={`Mark ${seat.name} present`}
                        onClick={() => mark(seat.id, seat.status === "PRESENT" ? "EXPECTED" : "PRESENT")}
                        className={`rounded p-1.5 ${
                          seat.status === "PRESENT"
                            ? "bg-[var(--success-soft)] text-[var(--success)]"
                            : "text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        aria-label={`Mark ${seat.name} absent`}
                        onClick={() => mark(seat.id, seat.status === "ABSENT" ? "EXPECTED" : "ABSENT")}
                        className={`rounded p-1.5 ${
                          seat.status === "ABSENT"
                            ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                            : "text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        <X className="size-4" />
                      </button>
                    </span>
                  ) : (
                    <Badge
                      tone={
                        seat.status === "PRESENT"
                          ? "success"
                          : seat.status === "ABSENT"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {seat.status === "EXPECTED" ? "Expected" : seat.status === "PRESENT" ? "Present" : "Absent"}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
