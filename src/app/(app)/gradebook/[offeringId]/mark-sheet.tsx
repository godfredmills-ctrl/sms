"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Save, Search, UserX } from "lucide-react";

import { Alert, Badge, Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

import { saveScores, type ScoreEntry } from "../actions";

export type SheetAssessment = {
  id: string;
  title: string;
  category: string;
  maxScore: number;
  weight: number;
  isExam: boolean;
  isPublished: boolean;
  isLocked: boolean;
};

export type SheetStudent = {
  id: string;
  fullName: string;
  admissionNo: string;
  rollNumber: number | null;
};

/** Keyed `${studentId}:${assessmentId}`. */
export type SheetMarks = Record<string, { score: number | null; isAbsent: boolean }>;

const key = (studentId: string, assessmentId: string) => `${studentId}:${assessmentId}`;

/**
 * The mark sheet.
 *
 * Students down, assessments across — the shape teachers already work in on
 * paper. Entry is keyboard-first: Enter and the arrow keys walk the column,
 * because marking a class means typing 30 numbers without touching the mouse.
 */
export function MarkSheet({
  offeringId,
  students,
  assessments,
  initialMarks,
  passMark,
  readOnly,
}: {
  offeringId: string;
  students: SheetStudent[];
  assessments: SheetAssessment[];
  initialMarks: SheetMarks;
  passMark: number;
  readOnly: boolean;
}) {
  const [marks, setMarks] = useState<SheetMarks>(initialMarks);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { tone: "success" | "danger"; message: string } | null
  >(null);

  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return students;
    return students.filter(
      (student) =>
        student.fullName.toLowerCase().includes(needle) ||
        student.admissionNo.toLowerCase().includes(needle),
    );
  }, [students, query]);

  function setMark(
    studentId: string,
    assessmentId: string,
    next: { score: number | null; isAbsent: boolean },
  ) {
    const cellKey = key(studentId, assessmentId);
    setMarks((current) => ({ ...current, [cellKey]: next }));
    setDirty((current) => new Set(current).add(cellKey));
    setResult(null);
  }

  /** Enter / arrows move down the column, which is how a register is read. */
  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    assessmentId: string,
  ) {
    const step =
      event.key === "Enter" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;

    event.preventDefault();
    const next = filtered[rowIndex + step];
    if (!next) return;
    inputs.current[key(next.id, assessmentId)]?.focus();
    inputs.current[key(next.id, assessmentId)]?.select();
  }

  /** Weighted subject total, recomputed live so a teacher sees the effect. */
  function totalFor(studentId: string): number | null {
    let weighted = 0;
    let weightUsed = 0;

    for (const assessment of assessments) {
      const cell = marks[key(studentId, assessment.id)];
      if (!cell || assessment.weight <= 0) continue;
      if (cell.score === null && !cell.isAbsent) continue;
      const percent = cell.isAbsent
        ? 0
        : ((cell.score ?? 0) / assessment.maxScore) * 100;
      weighted += (percent * assessment.weight) / 100;
      weightUsed += assessment.weight;
    }

    if (weightUsed === 0) return null;
    return Math.round((weighted / weightUsed) * 1000) / 10;
  }

  function save() {
    const entries: ScoreEntry[] = [];
    for (const cellKey of dirty) {
      const [studentId, assessmentId] = cellKey.split(":");
      const cell = marks[cellKey] ?? { score: null, isAbsent: false };
      entries.push({ studentId, assessmentId, score: cell.score, isAbsent: cell.isAbsent });
    }

    if (!entries.length) {
      setResult({ tone: "success", message: "Nothing has changed." });
      return;
    }

    startTransition(async () => {
      const response = await saveScores(offeringId, entries);
      if (response.ok) {
        setDirty(new Set());
        setResult({
          tone: "success",
          message: `Saved ${response.saved} mark${response.saved === 1 ? "" : "s"}${
            response.cleared ? `, cleared ${response.cleared}` : ""
          }.`,
        });
      } else {
        setResult({ tone: "danger", message: response.error });
      }
    });
  }

  const totalWeight = assessments.reduce((sum, entry) => sum + entry.weight, 0);

  if (!assessments.length) {
    return (
      <Alert tone="info" title="No assessments yet">
        Create an assessment before entering marks.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {result ? <Alert tone={result.tone}>{result.message}</Alert> : null}

      {totalWeight !== 100 ? (
        <Alert tone="warning">
          Assessment weights total {totalWeight}%, not 100%. Subject totals are
          calculated from the weights that exist, so they will change when the
          remaining {100 - totalWeight}% is added.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a student…"
            aria-label="Find a student"
            className="h-9 pl-9"
          />
        </div>

        {dirty.size > 0 ? (
          <Badge tone="warning">
            {dirty.size} unsaved change{dirty.size === 1 ? "" : "s"}
          </Badge>
        ) : null}

        <Button
          className="ml-auto"
          onClick={save}
          disabled={readOnly || pending || dirty.size === 0}
        >
          <Save className="size-4" />
          {pending ? "Saving…" : "Save marks"}
        </Button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="sticky-head border-b border-[var(--border)]">
              <th
                scope="col"
                className="sticky left-0 z-20 bg-[var(--bg-subtle)] px-3 py-2 text-left text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase"
              >
                Student
              </th>
              {assessments.map((assessment) => (
                <th
                  key={assessment.id}
                  scope="col"
                  className="px-2 py-2 text-center text-[11px] font-medium text-[var(--text-muted)]"
                  style={{ minWidth: 92 }}
                >
                  <span className="block truncate font-semibold" title={assessment.title}>
                    {assessment.title}
                  </span>
                  <span className="numeric block text-[10px] font-normal text-[var(--text-subtle)]">
                    /{assessment.maxScore} · {assessment.weight}%
                  </span>
                  {assessment.isExam ? <Badge tone="violet">Exam</Badge> : null}
                </th>
              ))}
              <th
                scope="col"
                className="px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase"
              >
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((student, rowIndex) => {
              const total = totalFor(student.id);

              return (
                <tr
                  key={student.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-subtle)]"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[var(--bg-elevated)] px-3 py-1.5 text-left font-normal"
                  >
                    <span className="block truncate text-sm font-medium">
                      {student.fullName}
                    </span>
                    <span className="numeric block text-[11px] text-[var(--text-subtle)]">
                      {student.admissionNo}
                    </span>
                  </th>

                  {assessments.map((assessment) => {
                    const cellKey = key(student.id, assessment.id);
                    const cell = marks[cellKey];
                    const disabled = readOnly || assessment.isLocked;
                    const isDirty = dirty.has(cellKey);
                    const percent =
                      cell?.score !== null && cell?.score !== undefined
                        ? (cell.score / assessment.maxScore) * 100
                        : null;

                    return (
                      <td key={assessment.id} className="px-1.5 py-1">
                        <div className="flex items-center gap-1">
                          <input
                            ref={(element) => {
                              inputs.current[cellKey] = element;
                            }}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={assessment.maxScore}
                            step="0.5"
                            disabled={disabled || cell?.isAbsent}
                            value={cell?.isAbsent ? "" : (cell?.score ?? "")}
                            aria-label={`${assessment.title} mark for ${student.fullName}`}
                            onKeyDown={(event) =>
                              handleKeyDown(event, rowIndex, assessment.id)
                            }
                            onChange={(event) => {
                              const raw = event.target.value;
                              const parsed = raw === "" ? null : Number(raw);
                              setMark(student.id, assessment.id, {
                                score:
                                  parsed === null || Number.isNaN(parsed) ? null : parsed,
                                isAbsent: false,
                              });
                            }}
                            className={cn(
                              "numeric h-8 w-full rounded border px-1.5 text-center text-sm",
                              "bg-[var(--bg-elevated)] text-[var(--text)]",
                              "focus:border-[var(--primary)] focus:outline-none",
                              isDirty
                                ? "border-[var(--warning)]"
                                : "border-[var(--border)]",
                              // A failing mark should be visible without reading it.
                              percent !== null &&
                                percent < passMark &&
                                "text-[var(--danger)]",
                              cell?.isAbsent && "bg-[var(--bg-subtle)]",
                              disabled && "cursor-not-allowed opacity-60",
                            )}
                          />
                          <button
                            type="button"
                            disabled={disabled}
                            title={cell?.isAbsent ? "Mark as present" : "Mark absent"}
                            aria-pressed={cell?.isAbsent ?? false}
                            onClick={() =>
                              setMark(student.id, assessment.id, {
                                score: null,
                                isAbsent: !cell?.isAbsent,
                              })
                            }
                            className={cn(
                              "flex size-6 shrink-0 items-center justify-center rounded text-[10px]",
                              cell?.isAbsent
                                ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                                : "text-[var(--text-subtle)] hover:bg-[var(--bg-subtle)]",
                              disabled && "cursor-not-allowed opacity-40",
                            )}
                          >
                            <UserX className="size-3" />
                          </button>
                        </div>
                      </td>
                    );
                  })}

                  <td className="numeric px-3 py-1.5 text-right">
                    {total === null ? (
                      <span className="text-[var(--text-subtle)]">—</span>
                    ) : (
                      <span
                        className={cn(
                          "font-semibold",
                          total < passMark && "text-[var(--danger)]",
                        )}
                      >
                        {total.toFixed(1)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={assessments.length + 2}
                  className="px-4 py-8 text-center text-sm text-[var(--text-muted)]"
                >
                  No students match &ldquo;{query}&rdquo;.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--text-subtle)]">
        Press <kbd className="rounded border border-[var(--border)] px-1">Enter</kbd> or
        the arrow keys to move down a column. Use the icon to mark a student absent —
        an absence is recorded, not scored as zero.
      </p>
    </div>
  );
}
