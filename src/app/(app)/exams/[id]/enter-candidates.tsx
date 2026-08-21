"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { Alert, Button, Field, Select } from "@/components/ui";

import { enterCandidatesAction, setSessionStatusAction } from "../actions";

/**
 * Entering a year group, and publishing.
 *
 * Entering hands out the index numbers. Running it again picks up whoever has
 * arrived since and leaves the existing numbers alone — a number already
 * printed on a slip must not become somebody else's.
 */
export function EnterCandidates({
  sessionId,
  levels,
}: {
  sessionId: string;
  levels: Array<{ id: string; name: string; entered: number; enrolled: number }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [levelId, setLevelId] = useState(levels[0]?.id ?? "");

  async function enter() {
    if (!levelId) return;
    setBusy(true);
    setProblem(null);
    setDone(null);
    const data = new FormData();
    data.append("sessionId", sessionId);
    data.append("classLevelId", levelId);
    const result = await enterCandidatesAction(data);
    setBusy(false);
    if (result.error) setProblem(result.error);
    else {
      setDone(result.message ?? "Entered.");
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}

      <Field label="Year group" htmlFor="enter-level">
        <Select
          id="enter-level"
          value={levelId}
          onChange={(event) => setLevelId(event.target.value)}
        >
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name} — {level.entered} of {level.enrolled} entered
            </option>
          ))}
        </Select>
      </Field>

      <Button size="sm" disabled={busy || !levelId} onClick={enter}>
        <UserPlus className="size-4" />
        {busy ? "Entering…" : "Enter this year group"}
      </Button>
    </div>
  );
}

/** Publishing the timetable, and putting it back. */
export function PublishSession({
  sessionId,
  status,
  blocking,
}: {
  sessionId: string;
  status: string;
  blocking: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function set(next: string) {
    setBusy(next);
    setProblem(null);
    const data = new FormData();
    data.append("id", sessionId);
    data.append("status", next);
    const result = await setSessionStatusAction(data);
    setBusy(null);
    if (result.error) setProblem(result.error);
    else router.refresh();
  }

  return (
    <div className="space-y-3">
      {problem ? <Alert tone="danger">{problem}</Alert> : null}

      {status === "DRAFT" ? (
        <>
          <Button
            disabled={busy !== null || blocking > 0}
            onClick={() => set("PUBLISHED")}
            className="w-full"
          >
            {busy === "PUBLISHED" ? "Publishing…" : "Publish the timetable"}
          </Button>
          {blocking > 0 ? (
            <p className="text-xs text-[var(--danger)]">
              {blocking} clash{blocking === 1 ? "" : "es"} to settle first. A timetable
              that puts a year group in two halls at once is not one to circulate.
            </p>
          ) : (
            <p className="text-xs text-[var(--text-subtle)]">
              Candidates and invigilators see it once it is published.
            </p>
          )}
        </>
      ) : null}

      {status === "PUBLISHED" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => set("COMPLETED")}
          >
            {busy === "COMPLETED" ? "Closing…" : "Mark them sat"}
          </Button>
          <Button variant="ghost" disabled={busy !== null} onClick={() => set("DRAFT")}>
            {busy === "DRAFT" ? "Withdrawing…" : "Withdraw the timetable"}
          </Button>
        </div>
      ) : null}

      {status === "COMPLETED" ? (
        <Button variant="ghost" disabled={busy !== null} onClick={() => set("PUBLISHED")}>
          {busy === "PUBLISHED" ? "Reopening…" : "Reopen"}
        </Button>
      ) : null}
    </div>
  );
}
