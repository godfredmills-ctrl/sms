"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Alert } from "@/components/ui";

import { loadStudentForEditAction } from "./actions";
import { StudentForm, type StudentFormValues } from "./[id]/edit/student-form";

/**
 * The edit form, fetched when the panel opens.
 *
 * The form has forty fields and the list can hold eight hundred pupils, so the
 * values are not carried on the rows. Opening the panel is one round trip,
 * which is the same round trip the old full page cost, minus losing the
 * registrar's search and their place in the table.
 *
 * There is a moment of "Loading" here that a page navigation would have spent
 * on a white screen instead. It is worth being honest about rather than hiding
 * behind a skeleton that pretends the fields are already there.
 */
export function StudentEditPanel({
  studentId,
  onSaved,
}: {
  studentId: string;
  onSaved: () => void;
}) {
  const [loaded, setLoaded] = useState<{
    values: StudentFormValues;
    canSeeBackground: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoaded(null);
    setError(null);

    loadStudentForEditAction(studentId)
      .then((result) => {
        if (!live) return;
        if (result.ok) setLoaded({ values: result.values, canSeeBackground: result.canSeeBackground });
        else setError(result.error);
      })
      .catch(() => {
        if (live) setError("That record could not be opened. Check your connection.");
      });

    // The panel can be closed and another row opened before this returns, and
    // the late answer would then fill the form with the wrong child.
    return () => {
      live = false;
    };
  }, [studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;

  if (!loaded) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-muted)]">
        <Loader2 className="size-4 animate-spin" />
        Loading the record…
      </div>
    );
  }

  return (
    <StudentForm
      values={loaded.values}
      canSeeBackground={loaded.canSeeBackground}
      onSuccess={onSaved}
    />
  );
}
