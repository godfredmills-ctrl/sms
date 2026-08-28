"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Alert } from "@/components/ui";
import type { SelectOption } from "@/components/select-search";

import { loadStaffForEditAction } from "./actions";
import { StaffForm, type StaffValues } from "./staff-form";

/**
 * The staff edit form, fetched when the panel opens.
 *
 * Same shape as the students one, and for the same reason: the values are far
 * too heavy to carry on every row, and the subject list the specialisations
 * picker needs is a second query on top of them.
 */
export function StaffEditPanel({
  staffId,
  onSaved,
}: {
  staffId: string;
  onSaved: () => void;
}) {
  const [loaded, setLoaded] = useState<{
    values: StaffValues;
    subjects: SelectOption[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoaded(null);
    setError(null);

    loadStaffForEditAction(staffId)
      .then((result) => {
        if (!live) return;
        if (result.ok) setLoaded({ values: result.values, subjects: result.subjects });
        else setError(result.error);
      })
      .catch(() => {
        if (live) setError("That record could not be opened. Check your connection.");
      });

    // Closing this panel and opening another row before the answer arrives
    // would otherwise fill the form with the wrong person.
    return () => {
      live = false;
    };
  }, [staffId]);

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
    <StaffForm
      values={loaded.values}
      subjects={loaded.subjects}
      onSuccess={onSaved}
    />
  );
}
