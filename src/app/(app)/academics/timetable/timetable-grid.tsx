"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Badge, Button, Field, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

import { saveTimetableSlotAction } from "../actions";

export type Slot = {
  id: string;
  dayOfWeek: number;
  periodIndex: number;
  startTime: string;
  endTime: string;
  room: string | null;
  label: string | null;
  isBreak: boolean;
  offeringId: string | null;
  subject: string | null;
  subjectColour: string | null;
  teacher: string | null;
};

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
];

/** Default period times, used when a slot is created from an empty cell. */
const PERIODS = [
  { index: 1, start: "07:30", end: "08:10" },
  { index: 2, start: "08:10", end: "08:50" },
  { index: 3, start: "08:50", end: "09:30" },
  { index: 4, start: "09:30", end: "10:10" },
  { index: 5, start: "10:10", end: "10:40" },
  { index: 6, start: "10:40", end: "11:20" },
  { index: 7, start: "11:20", end: "12:00" },
  { index: 8, start: "12:00", end: "12:40" },
  { index: 9, start: "13:20", end: "14:00" },
  { index: 10, start: "14:00", end: "14:40" },
];

export function TimetableGrid({
  sectionId,
  slots,
  offerings,
  canEdit,
  clashes,
}: {
  sectionId: string;
  slots: Slot[];
  offerings: SelectOption[];
  canEdit: boolean;
  /** Slot ids where the teacher is double-booked elsewhere at the same time. */
  clashes: Record<string, string>;
}) {
  const [editing, setEditing] = useState<{
    day: number;
    period: number;
    slot: Slot | null;
  } | null>(null);

  const byKey = new Map(slots.map((slot) => [`${slot.dayOfWeek}:${slot.periodIndex}`, slot]));

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-0.5">
          <thead>
            <tr>
              <th className="w-20 p-1 text-left text-xs font-medium text-[var(--text-muted)]">
                Period
              </th>
              {DAYS.map((day) => (
                <th
                  key={day.value}
                  className="p-1 text-left text-xs font-medium text-[var(--text-muted)]"
                >
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((period) => (
              <tr key={period.index}>
                <td className="p-1 align-top">
                  <div className="numeric rounded-lg bg-[var(--bg-subtle)] px-2 py-2 text-xs">
                    <div className="font-medium">{period.index}</div>
                    <div className="text-[10px] text-[var(--text-subtle)]">
                      {period.start}
                    </div>
                  </div>
                </td>

                {DAYS.map((day) => {
                  const slot = byKey.get(`${day.value}:${period.index}`);
                  const clash = slot ? clashes[slot.id] : undefined;

                  return (
                    <td key={day.value} className="p-1 align-top">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() =>
                          setEditing({
                            day: day.value,
                            period: period.index,
                            slot: slot ?? null,
                          })
                        }
                        className={cn(
                          "min-h-[58px] w-full rounded-lg border p-2 text-left text-xs transition-colors",
                          slot?.isBreak
                            ? "border-dashed border-[var(--border-strong)] bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                            : slot
                              ? "border-[var(--border)] bg-[var(--bg)]"
                              : "border-dashed border-[var(--border)] text-[var(--text-subtle)]",
                          clash && "border-[var(--danger)] bg-[var(--danger-soft)]",
                          canEdit && "hover:border-[var(--primary)]",
                        )}
                      >
                        {slot ? (
                          <>
                            <span className="flex items-center gap-1.5">
                              {slot.subjectColour ? (
                                <span
                                  aria-hidden
                                  className="size-2 shrink-0 rounded-full"
                                  style={{ background: slot.subjectColour }}
                                />
                              ) : null}
                              <span className="truncate font-medium">
                                {slot.label ?? slot.subject ?? "Free"}
                              </span>
                            </span>
                            {slot.teacher ? (
                              <span className="mt-0.5 block truncate text-[10px] text-[var(--text-subtle)]">
                                {slot.teacher}
                              </span>
                            ) : null}
                            {slot.room ? (
                              <span className="block truncate text-[10px] text-[var(--text-subtle)]">
                                {slot.room}
                              </span>
                            ) : null}
                            {clash ? (
                              <span className="mt-1 block text-[10px] font-medium text-[var(--danger)]">
                                Clashes with {clash}
                              </span>
                            ) : null}
                          </>
                        ) : canEdit ? (
                          <span className="flex items-center gap-1">
                            <Pencil className="size-3" />
                            Add
                          </span>
                        ) : (
                          <span>—</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            onClick={() => setEditing(null)}
          />
          <div className="card relative z-10 w-full max-w-md">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
              <p className="text-sm font-semibold">
                {DAYS.find((day) => day.value === editing.day)?.label} · period{" "}
                {editing.period}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                <X className="size-4" />
              </Button>
            </div>

            <form action={saveTimetableSlotAction} className="space-y-3 p-5">
              <input type="hidden" name="classSectionId" value={sectionId} />
              <input type="hidden" name="dayOfWeek" value={editing.day} />
              <input type="hidden" name="periodIndex" value={editing.period} />

              <Field
                label="Subject"
                htmlFor="offeringId"
                hint="Leave blank and give a label for assembly, break or prep."
              >
                <SearchableSelect
                  id="offeringId"
                  name="offeringId"
                  options={offerings}
                  defaultValue={editing.slot?.offeringId ?? ""}
                />
              </Field>

              <Field label="Label" htmlFor="label">
                <Input
                  id="label"
                  name="label"
                  defaultValue={editing.slot?.label ?? ""}
                  placeholder="Break"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts" htmlFor="startTime">
                  <Input
                    id="startTime"
                    name="startTime"
                    type="time"
                    defaultValue={
                      editing.slot?.startTime ??
                      PERIODS.find((period) => period.index === editing.period)?.start
                    }
                  />
                </Field>
                <Field label="Ends" htmlFor="endTime">
                  <Input
                    id="endTime"
                    name="endTime"
                    type="time"
                    defaultValue={
                      editing.slot?.endTime ??
                      PERIODS.find((period) => period.index === editing.period)?.end
                    }
                  />
                </Field>
              </div>

              <Field label="Room" htmlFor="room">
                <Input id="room" name="room" defaultValue={editing.slot?.room ?? ""} />
              </Field>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isBreak"
                  defaultChecked={editing.slot?.isBreak}
                  className="size-4 rounded border-[var(--border-strong)] accent-[var(--primary)]"
                />
                This is a break, not a lesson
              </label>

              <div className="flex items-center justify-between gap-2 pt-1">
                <Badge tone="neutral">
                  Clearing both subject and label removes the slot
                </Badge>
                <Button type="submit" size="sm">
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
