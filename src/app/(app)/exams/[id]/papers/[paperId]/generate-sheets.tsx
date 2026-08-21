"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";

import { Alert, Button, Field, Input } from "@/components/ui";

import { generatePaperMarkSheetsAction, setPaperMarkingAction } from "../../../actions";

/**
 * Creating the mark sheet column for each class sitting this paper.
 *
 * A separate press from creating the paper. Papers are added and rescheduled
 * all through timetabling and the weight is not settled until the end of it —
 * generating on save would have teachers watching columns appear and vanish in
 * their own gradebooks.
 */
export function GenerateSheets({
  paperId,
  sessionId,
  weight,
  maxMarks,
  sheets,
  sections,
}: {
  paperId: string;
  sessionId: string;
  weight: number | null;
  maxMarks: number | null;
  sheets: number;
  sections: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setProblem(null);
    setDone(null);
    const data = new FormData();
    data.append("paperId", paperId);
    const result = await generatePaperMarkSheetsAction(data);
    setBusy(false);
    if (result.error) setProblem(result.error);
    else {
      setDone(result.message ?? "Done.");
      router.refresh();
    }
  }

  const ready = weight !== null && weight > 0 && Boolean(maxMarks);

  return (
    <div className="space-y-3">
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}

      {!ready ? (
        // Asked for here rather than refused at the button. A weight of zero
        // makes a column that is entered and then ignored by the report card,
        // which is a worse outcome than being asked for a number.
        <form
          action={async (formData: FormData) => {
            const result = await setPaperMarkingAction(formData);
            if (result.error) setProblem(result.error);
            else router.refresh();
          }}
          className="space-y-3"
        >
          <input type="hidden" name="paperId" value={paperId} />
          <p className="text-sm text-[var(--text-muted)]">
            Before the marks have anywhere to go, this paper needs what it is marked
            out of and what share of the subject mark it carries.
          </p>
          <Field label="Weight (%)" htmlFor="gs-weight" required>
            <Input
              id="gs-weight"
              name="weight"
              inputMode="decimal"
              required
              defaultValue={weight !== null ? String(weight) : ""}
              placeholder="70"
            />
          </Field>
          <Field label="Out of" htmlFor="gs-max" required>
            <Input
              id="gs-max"
              name="maxMarks"
              inputMode="numeric"
              required
              defaultValue={maxMarks ? String(maxMarks) : "100"}
            />
          </Field>
          <Button type="submit" size="sm">
            Save these
          </Button>
        </form>
      ) : (
        <>
          <p className="text-sm text-[var(--text-muted)]">
            {sheets
              ? `${sheets} mark sheet${sheets === 1 ? "" : "s"}: ${sections.join(", ")}.`
              : "One column per class sitting this paper, each in that class's own gradebook."}
          </p>
          <Button size="sm" variant="secondary" disabled={busy} onClick={generate}>
            <FileSpreadsheet className="size-4" />
            {busy ? "Generating…" : sheets ? "Refresh the mark sheets" : "Generate mark sheets"}
          </Button>
          {sheets ? (
            <p className="text-xs text-[var(--text-subtle)]">
              Refreshing updates the title, the maximum and the weight. It never
              unpublishes a class whose marks have already gone out.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
