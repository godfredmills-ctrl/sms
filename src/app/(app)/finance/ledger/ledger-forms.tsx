"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Plus, Save, Trash2, Undo2 } from "lucide-react";

import {
  Alert,
  Button,
  CardBody,
  CheckboxField,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { ACCOUNT_TYPES, checkEntry } from "@/lib/ledger-rules";
import { formatMoney, toMinor } from "@/lib/money";

import {
  deleteJournalDraftAction,
  postJournalEntryAction,
  reverseJournalEntryAction,
  saveJournalEntryAction,
  saveLedgerAccountAction,
  type LedgerState,
} from "./actions";

export type AccountOption = {
  id: string;
  code: string;
  name: string;
  type: string;
};

function Submit({
  label,
  icon,
  variant,
  name,
}: {
  label: string;
  icon: React.ReactNode;
  variant?: "primary" | "secondary" | "outline" | "danger";
  name?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      disabled={pending}
      {...(name ? { name, value: "1" } : {})}
    >
      {icon}
      {pending ? "Working…" : label}
    </Button>
  );
}

function Outcome({ state }: { state: LedgerState }) {
  if (state.error) return <Alert tone="danger">{state.error}</Alert>;
  if (state.ok && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

// -----------------------------------------------------------------------------
// Writing an entry
// -----------------------------------------------------------------------------

type Row = { accountId: string; debit: string; credit: string; memo: string };

const BLANK: Row = { accountId: "", debit: "", credit: "", memo: "" };

export function JournalEntryForm({
  accounts,
  values,
  canPost,
}: {
  accounts: AccountOption[];
  values?: {
    id: string;
    narration: string;
    entryDate: string;
    lines: Row[];
  };
  canPost: boolean;
}) {
  const [state, action] = useActionState<LedgerState, FormData>(
    saveJournalEntryAction,
    {},
  );
  const [rows, setRows] = useState<Row[]>(
    values?.lines?.length ? values.lines : [BLANK, BLANK],
  );

  /**
   * The running check, shown while somebody types.
   *
   * The same function the server uses to decide whether this may be posted, so
   * the totals on screen and the refusal from the action cannot disagree. A
   * form that says "balanced" and then will not post is worse than one that
   * says nothing.
   */
  const verdict = useMemo(
    () =>
      checkEntry(
        rows.map((row) => ({
          accountId: row.accountId,
          debitMinor: row.debit ? toMinor(row.debit) : 0,
          creditMinor: row.credit ? toMinor(row.credit) : 0,
        })),
      ),
    [rows],
  );

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row, position) => (position === index ? { ...row, ...patch } : row)),
    );

  return (
    <form action={action}>
      <CardBody className="space-y-4">
        <Outcome state={state} />
        {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date" htmlFor="entryDate">
            <Input
              id="entryDate"
              name="entryDate"
              type="date"
              defaultValue={values?.entryDate}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="What this is for" htmlFor="narration">
              <Input
                id="narration"
                name="narration"
                required
                defaultValue={values?.narration}
                placeholder="Bank charges for August"
              />
            </Field>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                <th className="py-1.5 pr-2 font-medium">Account</th>
                <th className="py-1.5 pr-2 text-right font-medium">Debit</th>
                <th className="py-1.5 pr-2 text-right font-medium">Credit</th>
                <th className="py-1.5 font-medium">Memo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-1.5 pr-2">
                    <Select
                      name="accountId"
                      value={row.accountId}
                      onChange={(event) => update(index, { accountId: event.target.value })}
                      aria-label={`Account for line ${index + 1}`}
                    >
                      <option value="">Choose…</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} {account.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      name="debit"
                      inputMode="decimal"
                      className="text-right"
                      value={row.debit}
                      aria-label={`Debit for line ${index + 1}`}
                      // One side or the other. Typing in this box clears the
                      // other, so a line that is both cannot be built by hand.
                      onChange={(event) =>
                        update(index, {
                          debit: event.target.value,
                          credit: event.target.value ? "" : row.credit,
                        })
                      }
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      name="credit"
                      inputMode="decimal"
                      className="text-right"
                      value={row.credit}
                      aria-label={`Credit for line ${index + 1}`}
                      onChange={(event) =>
                        update(index, {
                          credit: event.target.value,
                          debit: event.target.value ? "" : row.debit,
                        })
                      }
                    />
                  </td>
                  <td className="py-1.5">
                    <Input
                      name="memo"
                      value={row.memo}
                      aria-label={`Memo for line ${index + 1}`}
                      onChange={(event) => update(index, { memo: event.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-sm font-medium">
                <td className="py-2 pr-2 text-right text-xs text-[var(--text-muted)]">
                  Totals
                </td>
                <td className="numeric py-2 pr-2 text-right">
                  {formatMoney(verdict.debitMinor)}
                </td>
                <td className="numeric py-2 pr-2 text-right">
                  {formatMoney(verdict.creditMinor)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRows((current) => [...current, { ...BLANK }])}
          >
            <Plus className="size-3.5" />
            Another line
          </Button>

          {verdict.balanced ? (
            <span className="text-xs font-medium text-[var(--success)]">
              Balanced. This can be posted.
            </span>
          ) : verdict.debitMinor || verdict.creditMinor ? (
            <span className="text-xs text-[var(--text-muted)]">
              {verdict.problems[verdict.problems.length - 1]}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
          <Submit label="Save as a draft" icon={<Save className="size-3.5" />} variant="outline" />
          {canPost ? (
            <Submit
              label="Post to the accounts"
              icon={<Check className="size-3.5" />}
              name="post"
            />
          ) : null}
        </div>

        {!canPost ? (
          <p className="text-xs text-[var(--text-muted)]">
            You can write entries but not post them. Somebody holding the posting
            permission puts them into the accounts.
          </p>
        ) : null}
      </CardBody>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Posting, reversing, discarding
// -----------------------------------------------------------------------------

export function PostButton({ id }: { id: string }) {
  const [state, action] = useActionState<LedgerState, FormData>(
    postJournalEntryAction,
    {},
  );
  return (
    <form action={action} className="space-y-2">
      <Outcome state={state} />
      <input type="hidden" name="id" value={id} />
      <Submit label="Post to the accounts" icon={<Check className="size-3.5" />} />
    </form>
  );
}

export function ReverseForm({ id, reference }: { id: string; reference: string }) {
  const [state, action] = useActionState<LedgerState, FormData>(
    reverseJournalEntryAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="id" value={id} />

      <Field
        label="Reversed on"
        htmlFor="reversedOn"
        hint="Blank means today. The reversal is posted on its own date."
      >
        <Input id="reversedOn" name="reversedOn" type="date" />
      </Field>

      <Field label="Why" htmlFor="reason">
        <Input id="reason" name="reason" placeholder="Posted to the wrong account" />
      </Field>

      <p className="text-xs text-[var(--text-muted)]">
        {reference} stays exactly as it is. The correction is its mirror, posted
        beside it, so both the mistake and the fix are on the record.
      </p>

      <Submit label="Reverse it" icon={<Undo2 className="size-3.5" />} variant="danger" />
    </form>
  );
}

export function DiscardDraftForm({ id }: { id: string }) {
  const [state, action] = useActionState<LedgerState, FormData>(
    deleteJournalDraftAction,
    {},
  );
  return (
    <form action={action} className="space-y-2">
      <Outcome state={state} />
      <input type="hidden" name="id" value={id} />
      <Submit label="Discard this draft" icon={<Trash2 className="size-3.5" />} variant="outline" />
    </form>
  );
}

// -----------------------------------------------------------------------------
// The chart of accounts
// -----------------------------------------------------------------------------

export function AccountForm({
  values = {},
  parents,
}: {
  values?: {
    id?: string;
    code?: string;
    name?: string;
    type?: string;
    parentId?: string | null;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
    isSystem?: boolean;
    postings?: number;
  };
  parents: AccountOption[];
}) {
  const [state, action] = useActionState<LedgerState, FormData>(
    saveLedgerAccountAction,
    {},
  );

  const locked = Boolean(values.postings && values.postings > 0);

  return (
    <form action={action} className="space-y-3">
      <Outcome state={state} />
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Code" htmlFor={`acc-code-${values.id ?? "new"}`}>
          <Input
            id={`acc-code-${values.id ?? "new"}`}
            name="code"
            required
            defaultValue={values.code}
            placeholder="1100"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Name" htmlFor={`acc-name-${values.id ?? "new"}`}>
            <Input
              id={`acc-name-${values.id ?? "new"}`}
              name="name"
              required
              defaultValue={values.name}
              placeholder="Bank: main account"
            />
          </Field>
        </div>
        <Field
          label="Kind"
          htmlFor={`acc-type-${values.id ?? "new"}`}
          hint={
            locked
              ? "Fixed: this account already has postings against it."
              : undefined
          }
        >
          <Select
            id={`acc-type-${values.id ?? "new"}`}
            name="type"
            required
            defaultValue={values.type ?? ""}
            disabled={locked}
          >
            <option value="">Choose…</option>
            {ACCOUNT_TYPES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* A disabled control posts nothing, so the value has to travel anyway or
          saving would clear the account's type. */}
      {locked && values.type ? (
        <input type="hidden" name="type" value={values.type} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Sits under"
          htmlFor={`acc-parent-${values.id ?? "new"}`}
          hint="Optional. Groups accounts on a statement without merging their balances."
        >
          <Select
            id={`acc-parent-${values.id ?? "new"}`}
            name="parentId"
            defaultValue={values.parentId ?? ""}
          >
            <option value="">Nothing</option>
            {parents
              .filter((parent) => parent.id !== values.id)
              .map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.code} {parent.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Order" htmlFor={`acc-sort-${values.id ?? "new"}`}>
          <Input
            id={`acc-sort-${values.id ?? "new"}`}
            name="sortOrder"
            type="number"
            defaultValue={values.sortOrder ?? 0}
          />
        </Field>
      </div>

      <Field label="Note" htmlFor={`acc-desc-${values.id ?? "new"}`}>
        <Textarea
          id={`acc-desc-${values.id ?? "new"}`}
          name="description"
          rows={2}
          defaultValue={values.description ?? ""}
        />
      </Field>

      <CheckboxField
        name="isActive"
        label="In use"
        description={
          values.isSystem
            ? "This account is relied on by the automatic postings. It can be renamed but should stay in use."
            : "Turn off to keep it out of new entries. Its history stays."
        }
        defaultChecked={values.isActive ?? true}
      />

      <Submit
        label={values.id ? "Save" : "Add the account"}
        icon={<Save className="size-3.5" />}
      />
    </form>
  );
}
