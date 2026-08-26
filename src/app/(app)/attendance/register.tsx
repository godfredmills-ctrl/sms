"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, CheckCheck, Save, Search } from "lucide-react";
import type { AttendanceStatus } from "@prisma/client";

import { Alert, Avatar, Badge, Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

import { saveAttendance } from "./actions";

export type RegisterStudent = {
  id: string;
  fullName: string;
  admissionNo: string;
  photoUrl: string | null;
  rollNumber: number | null;
  /** Attendance rate so far this term, to give the teacher context. */
  termRate: number | null;
};

const STATUSES: Array<{
  value: AttendanceStatus;
  label: string;
  short: string;
  className: string;
}> = [
  {
    value: "PRESENT",
    label: "Present",
    short: "P",
    className:
      "bg-[var(--success-soft)] text-[var(--success)] border-[var(--success)]",
  },
  {
    value: "LATE",
    label: "Late",
    short: "L",
    className:
      "bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]",
  },
  {
    value: "ABSENT",
    label: "Absent",
    short: "A",
    className: "bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]",
  },
  {
    value: "EXCUSED",
    label: "Excused",
    short: "E",
    className: "bg-[var(--info-soft)] text-[var(--info)] border-[var(--info)]",
  },
  {
    value: "SICK",
    label: "Sick",
    short: "S",
    className: "bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border-strong)]",
  },
];

/**
 * The class register.
 *
 * Optimised for the actual job: a teacher on a phone, marking 25 names in
 * under a minute. Everyone starts Present (the common case), and only the
 * exceptions need a tap.
 */
export function AttendanceRegister({
  students,
  classSectionId,
  termId,
  date,
  className,
  existing,
  locked,
}: {
  students: RegisterStudent[];
  classSectionId: string;
  termId: string;
  date: string;
  className: string;
  existing: Record<string, AttendanceStatus>;
  locked: boolean;
}) {
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(
      students.map((student) => [student.id, existing[student.id] ?? "PRESENT"]),
    ),
  );
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { tone: "success" | "danger"; message: string } | null
  >(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return students;
    return students.filter(
      (student) =>
        student.fullName.toLowerCase().includes(needle) ||
        student.admissionNo.toLowerCase().includes(needle),
    );
  }, [students, query]);

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const status of Object.values(marks)) {
      tally[status] = (tally[status] ?? 0) + 1;
    }
    return tally;
  }, [marks]);

  const presentish =
    (counts.PRESENT ?? 0) + (counts.LATE ?? 0) + (counts.EXCUSED ?? 0);
  const rate = students.length ? (presentish / students.length) * 100 : 0;

  function markAll(status: AttendanceStatus) {
    setMarks(Object.fromEntries(students.map((student) => [student.id, status])));
  }

  function submit() {
    setResult(null);
    startTransition(async () => {
      const response = await saveAttendance({
        classSectionId,
        termId,
        date,
        entries: students.map((student) => ({
          studentId: student.id,
          status: marks[student.id] ?? "PRESENT",
        })),
      });

      setResult(
        response.ok
          ? {
              tone: "success",
              message: `Register saved for ${response.recorded} students.${
                response.notified
                  ? ` ${response.notified} guardian${response.notified === 1 ? "" : "s"} notified of absence.`
                  : ""
              }`,
            }
          : { tone: "danger", message: response.error },
      );
    });
  }

  return (
    <div className="space-y-4">
      {result ? <Alert tone={result.tone}>{result.message}</Alert> : null}

      {locked ? (
        <Alert tone="warning" title="This register is locked">
          The term has been closed. Ask an administrator to unlock it before making
          changes.
        </Alert>
      ) : null}

      {/* Summary bar */}
      <div className="card flex flex-wrap items-center gap-4 p-4">
        <div>
          <p className="text-xs text-[var(--text-muted)]">{className}</p>
          <p className="numeric text-2xl font-semibold">{rate.toFixed(0)}%</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <div
              key={status.value}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-center",
                status.className,
              )}
            >
              <p className="numeric text-sm font-semibold">
                {counts[status.value] ?? 0}
              </p>
              <p className="text-[10px]">{status.label}</p>
            </div>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAll("PRESENT")}
            disabled={locked || pending}
          >
            <CheckCheck className="size-3.5" />
            All present
          </Button>
          <Button onClick={submit} disabled={locked || pending} size="sm">
            <Save className="size-3.5" />
            {pending ? "Saving…" : "Save register"}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
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

      {/* Roll */}
      <ul className="card divide-y divide-[var(--border)] overflow-hidden">
        {filtered.map((student) => {
          const current = marks[student.id] ?? "PRESENT";
          return (
            <li
              key={student.id}
              className="flex flex-wrap items-center gap-3 px-4 py-2.5"
            >
              <span className="numeric w-6 shrink-0 text-xs text-[var(--text-subtle)]">
                {student.rollNumber ?? "-"}
              </span>
              <Avatar name={student.fullName} src={student.photoUrl} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{student.fullName}</p>
                <p className="numeric truncate text-xs text-[var(--text-subtle)]">
                  {student.admissionNo}
                  {student.termRate !== null ? (
                    <span
                      className={cn(
                        "ml-2",
                        student.termRate < 85 && "text-[var(--danger)]",
                      )}
                    >
                      {student.termRate.toFixed(0)}% this term
                    </span>
                  ) : null}
                </p>
              </div>

              <div
                className="flex shrink-0 gap-1"
                role="radiogroup"
                aria-label={`Attendance for ${student.fullName}`}
              >
                {STATUSES.map((status) => {
                  const isActive = current === status.value;
                  return (
                    <button
                      key={status.value}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      disabled={locked}
                      title={status.label}
                      onClick={() =>
                        setMarks((current) => ({
                          ...current,
                          [student.id]: status.value,
                        }))
                      }
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg border text-xs font-semibold transition-colors disabled:opacity-40",
                        isActive
                          ? status.className
                          : "border-[var(--border)] text-[var(--text-subtle)] hover:bg-[var(--bg-subtle)]",
                      )}
                    >
                      {isActive ? <Check className="size-3.5" /> : status.short}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}

        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            No students match &ldquo;{query}&rdquo;.
          </li>
        ) : null}
      </ul>

      {students.length > 8 ? (
        <div className="flex justify-end">
          <Button onClick={submit} disabled={locked || pending}>
            <Save className="size-4" />
            {pending ? "Saving…" : "Save register"}
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-[var(--text-subtle)]">
        <Badge tone="neutral">Tip</Badge> Everyone starts as present: mark only the
        exceptions, then save.
      </p>
    </div>
  );
}
