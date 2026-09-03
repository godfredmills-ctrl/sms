"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Badge, Button, Field, Input } from "@/components/ui";
import { DAYS as WEEK, type Period } from "@/lib/timetable-rules";
import { cn } from "@/lib/utils";

import { saveTimetableSlotAction, type AcademicState } from "../actions";

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

/*
 * The school week and the school day both arrive as data.
 *
 * The period times used to be a constant in this file, which meant a school
 * whose first bell is at 07:00 could not change it without a deploy, and every
 * other screen that drew a timetable carried its own copy of the same list.
 */
const DAYS = WEEK.filter((day) => day.value <= 5);

export function TimetableGrid({
  sectionId,
  slots,
  offerings,
  canEdit,
  clashes,
  periods,
}: {
  sectionId: string;
  slots: Slot[];
  offerings: SelectOption[];
  canEdit: boolean;
  /** Slot ids where the teacher is double-booked elsewhere at the same time. */
  clashes: Record<string, string>;
  /** The school's bell schedule, from Settings. */
  periods: Period[];
}) {
  const [editing, setEditing] = useState<{
    day: number;
    period: number;
    slot: Slot | null;
  } | null>(null);

  const router = useRouter();
  const [state, action] = useActionState<AcademicState, FormData>(
    saveTimetableSlotAction,
    {},
  );

  // The panel closes on a save and stays open on a refusal, with the reason in
  // it. Closing on both would throw away the only explanation of why nothing
  // happened.
  useEffect(() => {
    if (state.ok) {
      router.refresh();
      setEditing(null);
    }
  }, [state.ok, router]);

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
            {periods.map((period) => (
              <tr key={period.periodIndex}>
                <td className="p-1 align-top">
                  <div className="numeric rounded-lg bg-[var(--bg-subtle)] px-2 py-2 text-xs">
                    <div className="font-medium">{period.periodIndex}</div>
                    <div className="text-[10px] text-[var(--text-subtle)]">
                      {period.startTime}
                    </div>
                    {period.label ? (
                      <div className="text-[10px] text-[var(--text-subtle)]">
                        {period.label}
                      </div>
                    ) : null}
                  </div>
                </td>

                {DAYS.map((day) => {
                  const slot = byKey.get(`${day.value}:${period.periodIndex}`);
                  const clash = slot ? clashes[slot.id] : undefined;

                  return (
                    <td key={day.value} className="p-1 align-top">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() =>
                          setEditing({
                            day: day.value,
                            period: period.periodIndex,
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
                          <span>-</span>
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

            <form action={action} className="space-y-3 p-5">
              {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
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
                      periods.find((period) => period.periodIndex === editing.period)
                        ?.startTime
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
                      periods.find((period) => period.periodIndex === editing.period)
                        ?.endTime
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
