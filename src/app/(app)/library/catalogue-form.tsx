"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { BookPlus } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  CardBody,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { CONDITIONS, ITEM_CATEGORIES } from "@/lib/library";

import { saveItemAction, type LibraryState } from "./actions";

/**
 * Cataloguing a title and the copies of it in one pass.
 *
 * A librarian with a box of thirty readers types the title once and the
 * thirty accession numbers into one box — the numbers are already written in
 * the covers, so they are transcribed rather than invented, and asking for
 * them one form at a time is thirty forms.
 */
export function CatalogueForm({ subjects }: { subjects: SelectOption[] }) {
  const [state, action] = useActionState<LibraryState, FormData>(saveItemAction, {});
  const [showDetail, setShowDetail] = useState(false);

  // Remount on success: the searchable subject select keeps its choice in its
  // own state, where a form.reset() cannot reach it.
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (state.ok) {
      setFormKey((key) => key + 1);
      setShowDetail(false);
    }
  }, [state]);

  return (
    <form key={formKey} action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Title" htmlFor="item-title" required>
          <Input id="item-title" name="title" required autoComplete="off" />
        </Field>

        <Field label="Author" htmlFor="item-author">
          <Input id="item-author" name="author" autoComplete="off" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kind" htmlFor="item-category">
            <Select id="item-category" name="category" defaultValue="FICTION">
              {ITEM_CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Shelf mark" htmlFor="item-shelf" hint="What is on the spine.">
            <Input id="item-shelf" name="shelfMark" autoComplete="off" />
          </Field>
        </div>

        <Field
          label="Accession numbers"
          htmlFor="item-accessions"
          hint="One per line, or separated by commas. One copy each."
        >
          <Textarea
            id="item-accessions"
            name="accessionNos"
            rows={3}
            placeholder={"GCS-004821\nGCS-004822\nGCS-004823"}
            className="font-mono text-xs"
          />
        </Field>

        {showDetail ? (
          <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
            <Field label="Subject" htmlFor="item-subject" hint="Where it supports one.">
              <SearchableSelect
                id="item-subject"
                name="subjectId"
                options={subjects}
                placeholder="No particular subject"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ISBN" htmlFor="item-isbn">
                <Input id="item-isbn" name="isbn" autoComplete="off" />
              </Field>
              <Field label="Publisher" htmlFor="item-publisher">
                <Input id="item-publisher" name="publisher" autoComplete="off" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Year" htmlFor="item-year">
                <Input id="item-year" name="published" inputMode="numeric" />
              </Field>
              <Field label="Edition" htmlFor="item-edition">
                <Input id="item-edition" name="edition" />
              </Field>
              <Field label="Condition" htmlFor="item-condition">
                <Select id="item-condition" name="condition" defaultValue="GOOD">
                  {CONDITIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cost per copy" htmlFor="item-cost" hint="For a replacement charge.">
                <Input id="item-cost" name="cost" inputMode="decimal" placeholder="0.00" />
              </Field>
              <Field label="Acquired" htmlFor="item-acquired">
                <Input id="item-acquired" name="acquiredOn" type="date" />
              </Field>
            </div>
            <Field label="Summary" htmlFor="item-summary">
              <Textarea id="item-summary" name="summary" rows={2} />
            </Field>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDetail(true)}
            className="text-xs font-medium text-[var(--primary)]"
          >
            Add subject, ISBN, cost and more
          </button>
        )}

        <SubmitButton />
      </CardBody>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      <BookPlus className="size-4" />
      {pending ? "Saving…" : "Add to the catalogue"}
    </Button>
  );
}
