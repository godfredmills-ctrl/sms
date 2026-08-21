"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Save } from "lucide-react";

import { Alert, Badge, Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

import { saveExamPaperMarks, type ScriptMark } from "../../../../actions";

export type ScriptRowView = {
  candidateId: string;
  candidateNo: string;
  studentName: string;
  seatNo: string | null;
  venueName: string | null;
  seatStatus: "EXPECTED" | "PRESENT" | "ABSENT" | null;
  seatRemark: string | null;
  enteredSection: string | null;
  marksSection: string | null;
  score: number | null;
  blockedReason: string | null;
  /** False when the class is somebody else's to mark. */
  mine: boolean;
};

/**
 * Marking a paper.
 *
 * The order is the pile's order — seat number — because the invigilator
 * collected the scripts row by row and that is how they are stacked on the
 * desk. A class register sorted by roll number is the wrong list entirely: it
 * would have to be searched once per script.
 *
 * Names are hidden by default. A script carries an index number and no name,
 * and a marker who cannot see whose paper they are marking marks it more
 * fairly. The toggle is there for when somebody has to be found.
 *
 * There is no absence control. A candidate the invigilator wrote down as
 * absent shows as absent and takes no input — the register was marked in the
 * hall by somebody who was there, and a second absence flag on this screen
 * would be a second answer to the same question.
 */
export function MarkScripts({
  paperId,
  maxMarks,
  rows,
  readOnly,
}: {
  paperId: string;
  maxMarks: number;
  rows: ScriptRowView[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marks, setMarks] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(rows.map((row) => [row.candidateId, row.score])),
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [showNames, setShowNames] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const markable = useMemo(
    () => rows.filter((row) => !row.blockedReason && row.seatStatus !== "ABSENT" && row.mine),
    [rows],
  );
  const blocked = useMemo(() => rows.filter((row) => row.blockedReason), [rows]);
  const entered = markable.filter((row) => marks[row.candidateId] !== null).length;

  function set(candidateId: string, raw: string) {
    const value = raw.trim() === "" ? null : Number(raw);
    setMarks((current) => ({ ...current, [candidateId]: value }));
    setDirty((current) => new Set(current).add(candidateId));
  }

  /** Enter walks down the column, which is how a pile is worked through. */
  function onKey(event: React.KeyboardEvent<HTMLInputElement>, at: number) {
    const step =
      event.key === "Enter" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = markable[at + step];
    if (!next) return;
    inputs.current[next.candidateId]?.focus();
    inputs.current[next.candidateId]?.select();
  }

  function save() {
    const entries: ScriptMark[] = [...dirty].map((candidateId) => ({
      candidateId,
      score: marks[candidateId] ?? null,
    }));
    if (entries.length === 0) return;

    setProblem(null);
    setDone(null);
    start(async () => {
      const result = await saveExamPaperMarks(paperId, entries);
      if (result.error) {
        setProblem(result.error);
        return;
      }
      setDirty(new Set());
      setDone(result.message ?? "Saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowNames((on) => !on)}
        >
          {showNames ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {showNames ? "Hide names" : "Show names"}
        </Button>
        <span className="text-xs text-[var(--text-subtle)]">
          {entered} of {markable.length} marked
          {dirty.size ? ` · ${dirty.size} unsaved` : ""}
        </span>
        {!readOnly ? (
          <Button
            size="sm"
            className="ml-auto"
            disabled={pending || dirty.size === 0}
            onClick={save}
          >
            <Save className="size-4" />
            {pending ? "Saving…" : `Save ${dirty.size || ""}`.trim()}
          </Button>
        ) : null}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left">
              <th className="px-3 py-2 font-medium text-[var(--text-muted)]">Seat</th>
              <th className="px-3 py-2 font-medium text-[var(--text-muted)]">Index</th>
              {showNames ? (
                <th className="px-3 py-2 font-medium text-[var(--text-muted)]">Candidate</th>
              ) : null}
              <th className="px-3 py-2 font-medium text-[var(--text-muted)]">Class</th>
              <th className="px-3 py-2 text-right font-medium text-[var(--text-muted)]">
                Mark /{maxMarks}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((row) => !row.blockedReason)
              .map((row) => {
                const absent = row.seatStatus === "ABSENT";
                const at = markable.indexOf(row);
                const moved =
                  row.enteredSection &&
                  row.marksSection &&
                  row.enteredSection !== row.marksSection;

                return (
                  <tr
                    key={row.candidateId}
                    className={cn(
                      "border-b border-[var(--border)] last:border-0",
                      absent && "bg-[var(--danger-soft)]/30",
                      !row.mine && "opacity-60",
                    )}
                  >
                    <td className="numeric px-3 py-1.5 whitespace-nowrap">
                      {row.seatNo ?? "—"}
                      {row.venueName ? (
                        <span className="ml-1 text-xs text-[var(--text-subtle)]">
                          {row.venueName}
                        </span>
                      ) : null}
                    </td>
                    <td className="numeric px-3 py-1.5 font-medium whitespace-nowrap">
                      {row.candidateNo}
                    </td>
                    {showNames ? (
                      <td className="px-3 py-1.5">{row.studentName}</td>
                    ) : null}
                    <td className="px-3 py-1.5 text-[var(--text-muted)]">
                      {row.marksSection ?? "—"}
                      {moved ? (
                        // Said out loud rather than resolved silently. The
                        // candidate is on 3A's hall list because that is where
                        // they were entered from, and the mark has to go to
                        // 3B because that is where the report card will look.
                        <span className="ml-1 text-xs text-[var(--warning)]">
                          entered from {row.enteredSection}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {absent ? (
                        <span title={row.seatRemark ?? "Marked absent in the hall"}>
                          <Badge tone="danger">Abs</Badge>
                        </span>
                      ) : row.mine && !readOnly ? (
                        <Input
                          ref={(element) => {
                            inputs.current[row.candidateId] = element;
                          }}
                          type="number"
                          min={0}
                          max={maxMarks}
                          inputMode="numeric"
                          value={marks[row.candidateId] ?? ""}
                          onChange={(event) => set(row.candidateId, event.target.value)}
                          onKeyDown={(event) => onKey(event, at)}
                          className="numeric w-20 text-right"
                        />
                      ) : (
                        <span className="numeric text-[var(--text-muted)]">
                          {marks[row.candidateId] ?? "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {blocked.length ? (
        <Alert
          tone="warning"
          title={`${blocked.length} candidate${blocked.length === 1 ? "" : "s"} cannot be marked`}
        >
          <ul className="mt-1 space-y-1">
            {blocked.map((row) => (
              <li key={row.candidateId} className="numeric text-xs">
                {row.candidateNo}
                <span className="ml-2 font-sans">{row.blockedReason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            They are listed rather than dropped. A candidate quietly missing from a
            marking sheet is a script nobody looks for.
          </p>
        </Alert>
      ) : null}
    </div>
  );
}
