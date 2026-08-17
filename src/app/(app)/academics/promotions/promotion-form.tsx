"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowUpRight, GraduationCap, Repeat2 } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  Field,
} from "@/components/ui";

import { promoteClassAction, type PromotionState } from "./actions";

export type PromotionSection = {
  id: string;
  label: string;
  levelSequence: number;
  isFinal: boolean;
  students: Array<{ id: string; name: string; average: number | null }>;
};

/**
 * One class's move into the new year.
 *
 * Everyone defaults to promoted; the exceptions — a child repeating the year —
 * are ticked individually, because that is the shape of the real decision: the
 * class moves, and the staff meeting names the exceptions. A final-level class
 * flips to graduating, which needs no target class at all.
 */
export function PromotionForm({
  sections,
  fromYear,
  toYears,
}: {
  sections: PromotionSection[];
  fromYear: { id: string; name: string };
  toYears: SelectOption[];
}) {
  const [state, action] = useActionState<PromotionState, FormData>(
    promoteClassAction,
    {},
  );
  const [fromSectionId, setFromSectionId] = useState<string>("");
  const [repeaters, setRepeaters] = useState<Set<string>>(new Set());
  const [graduating, setGraduating] = useState(false);

  const source = sections.find((section) => section.id === fromSectionId) ?? null;

  // Targets: the sections one level up, or the same level for the repeat
  // stream. Both computed from the source, so choosing a class narrows
  // everything else to what makes sense for it.
  const targets = useMemo(
    () =>
      source
        ? sections
            .filter((section) => section.levelSequence === source.levelSequence + 1)
            .map((section) => ({ value: section.id, label: section.label }))
        : [],
    [sections, source],
  );
  const sameLevel = useMemo(
    () =>
      source
        ? sections
            .filter((section) => section.levelSequence === source.levelSequence)
            .map((section) => ({ value: section.id, label: section.label }))
        : [],
    [sections, source],
  );

  const toggleRepeat = (studentId: string) =>
    setRepeaters((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });

  return (
    <form action={action}>
      <input type="hidden" name="fromYearId" value={fromYear.id} />
      <CardBody className="space-y-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Class in ${fromYear.name}`} htmlFor="fromSectionId" required>
            <SearchableSelect
              id="fromSectionId"
              name="fromSectionId"
              options={sections.map((section) => ({
                value: section.id,
                label: section.label,
                description: `${section.students.length} students`,
              }))}
              value={fromSectionId}
              onChange={(value) => {
                setFromSectionId(value as string);
                setRepeaters(new Set());
                const chosen = sections.find((section) => section.id === value);
                setGraduating(Boolean(chosen?.isFinal));
              }}
              required
            />
          </Field>
          <Field label="Into academic year" htmlFor="toYearId" required>
            <SearchableSelect
              id="toYearId"
              name="toYearId"
              options={toYears}
              defaultValue={toYears[0]?.value}
              clearable={false}
              required
            />
          </Field>
        </div>

        {source ? (
          <>
            {source.isFinal ? (
              <CheckboxField
                name="graduating"
                checked={graduating}
                onChange={(event) => setGraduating(event.target.checked)}
                label="This class is graduating"
                description="The final level: everyone leaves as a graduate, and no new class is needed."
              />
            ) : null}

            {!graduating ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Promoted students join"
                  htmlFor="toSectionId"
                  required
                  hint={
                    targets.length
                      ? undefined
                      : "No class exists at the next level — create it under Class sections first."
                  }
                >
                  <SearchableSelect
                    id="toSectionId"
                    name="toSectionId"
                    options={targets}
                    defaultValue={targets[0]?.value}
                    required
                  />
                </Field>
                <Field
                  label="Repeating students join"
                  htmlFor="repeatSectionId"
                  hint="Usually the class they were in."
                >
                  <SearchableSelect
                    id="repeatSectionId"
                    name="repeatSectionId"
                    options={sameLevel}
                    defaultValue={source.id}
                  />
                </Field>
              </div>
            ) : null}

            <Card>
              <CardHeader
                title={`${source.students.length} students`}
                description={
                  graduating
                    ? "Everyone below graduates."
                    : "Everyone is promoted unless marked to repeat."
                }
              />
              <ul className="max-h-96 divide-y divide-[var(--border)] overflow-y-auto">
                {source.students.map((student) => {
                  const repeating = !graduating && repeaters.has(student.id);
                  const decision = graduating
                    ? "GRADUATED"
                    : repeating
                      ? "REPEATED"
                      : "PROMOTED";
                  return (
                    <li
                      key={student.id}
                      className="flex items-center gap-3 px-4 py-2"
                    >
                      <input
                        type="hidden"
                        name="decisions"
                        value={`${student.id}:${decision}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {student.name}
                      </span>
                      {student.average !== null ? (
                        <span
                          className={`numeric text-xs ${
                            student.average < 50
                              ? "font-semibold text-[var(--danger)]"
                              : "text-[var(--text-subtle)]"
                          }`}
                          title="Average on the latest published report card"
                        >
                          {student.average.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-subtle)]">no card</span>
                      )}
                      {graduating ? (
                        <Badge tone="violet">
                          <GraduationCap className="size-2.5" />
                          Graduates
                        </Badge>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleRepeat(student.id)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                            repeating
                              ? "bg-[var(--warning-soft)] text-[var(--warning)]"
                              : "bg-[var(--bg-subtle)] text-[var(--text-subtle)] hover:text-[var(--text)]"
                          }`}
                        >
                          <Repeat2 className="size-3" />
                          {repeating ? "Repeats" : "Repeat?"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Submit
              graduating={graduating}
              disabled={!graduating && !targets.length}
            />
          </>
        ) : null}
      </CardBody>
    </form>
  );
}

function Submit({ graduating, disabled }: { graduating: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending || disabled}>
      <ArrowUpRight className="size-4" />
      {pending
        ? "Moving…"
        : graduating
          ? "Graduate this class"
          : "Move this class up"}
    </Button>
  );
}
