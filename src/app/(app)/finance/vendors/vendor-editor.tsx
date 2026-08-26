"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Plus, X } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { CATEGORY_KINDS } from "@/lib/expense-labels";
import { formatMoney } from "@/lib/money";

import { saveCategoryAction, saveVendorAction, type VendorState } from "./actions";

export type VendorRow = {
  id: string;
  name: string;
  supplies: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tin: string | null;
  bankName: string | null;
  bankAccount: string | null;
  momoNumber: string | null;
  notes: string | null;
  active: boolean;
  bills: number;
  spentMinor: number;
};

export type CategoryRow = {
  id: string;
  name: string;
  code: string | null;
  kind: string;
  sortOrder: number;
  notes: string | null;
  active: boolean;
  bills: number;
  spentMinor: number;
};

/**
 * Vendors and categories, side by side.
 *
 * They are on one page because they are one job — setting up what a bill can
 * be called and who it can be to — and because a bursar arriving here has
 * usually come from a bill they could not finish recording.
 *
 * Neither can be deleted. A category with bills against it is what those
 * bills are called, and removing it would leave last term's statement unable
 * to name its own largest line; a vendor is who the school paid. Both are
 * deactivated instead, which takes them out of the pickers and leaves the
 * history intact.
 */
export function VendorEditor({
  vendors,
  categories,
  canManage,
}: {
  vendors: VendorRow[];
  categories: CategoryRow[];
  canManage: boolean;
}) {
  const [editingVendor, setEditingVendor] = useState<VendorRow | "new" | null>(null);
  const [editingCategory, setEditingCategory] = useState<CategoryRow | "new" | null>(null);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Expense categories"
          description="The lines on the income and expenditure statement."
          action={
            canManage ? (
              <Button size="sm" variant="secondary" onClick={() => setEditingCategory("new")}>
                <Plus className="size-4" />
                Add
              </Button>
            ) : null
          }
        />
        <CardBody className="space-y-3">
          {editingCategory ? (
            <CategoryForm
              row={editingCategory === "new" ? undefined : editingCategory}
              onDone={() => setEditingCategory(null)}
            />
          ) : null}

          {categories.length === 0 ? (
            <p className="text-sm text-[var(--text-subtle)]">
              None yet. A bill has to be called something before it can appear on a
              statement.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {categories.map((category) => (
                <li key={category.id} className="flex items-start gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm text-[var(--text)]">
                      {category.name}
                      {category.active ? null : <Badge tone="neutral">Not in use</Badge>}
                    </p>
                    <p className="text-xs text-[var(--text-subtle)]">
                      {[
                        category.code,
                        CATEGORY_KINDS.find((entry) => entry.value === category.kind)?.label,
                        category.bills
                          ? `${category.bills} bill${category.bills === 1 ? "" : "s"} · ${formatMoney(category.spentMinor)}`
                          : "nothing recorded yet",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => setEditingCategory(category)}
                      className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                      aria-label={`Edit ${category.name}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Vendors"
          description="Suppliers, contractors and utilities the school pays."
          action={
            canManage ? (
              <Button size="sm" variant="secondary" onClick={() => setEditingVendor("new")}>
                <Plus className="size-4" />
                Add
              </Button>
            ) : null
          }
        />
        <CardBody className="space-y-3">
          {editingVendor ? (
            <VendorForm
              row={editingVendor === "new" ? undefined : editingVendor}
              onDone={() => setEditingVendor(null)}
            />
          ) : null}

          {vendors.length === 0 ? (
            <p className="text-sm text-[var(--text-subtle)]">
              None yet. A bill can be recorded without one: a market purchase often
              has no vendor: but a supplier you pay every term belongs here.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {vendors.map((vendor) => (
                <li key={vendor.id} className="flex items-start gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm text-[var(--text)]">
                      {vendor.name}
                      {vendor.active ? null : <Badge tone="neutral">Not in use</Badge>}
                    </p>
                    <p className="truncate text-xs text-[var(--text-subtle)]">
                      {[
                        vendor.supplies,
                        vendor.phone,
                        vendor.tin ? `TIN ${vendor.tin}` : null,
                        vendor.bills
                          ? `${vendor.bills} bill${vendor.bills === 1 ? "" : "s"} · ${formatMoney(vendor.spentMinor)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No details recorded"}
                    </p>
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => setEditingVendor(vendor)}
                      className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                      aria-label={`Edit ${vendor.name}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function CategoryForm({ row, onDone }: { row?: CategoryRow; onDone: () => void }) {
  const [state, action] = useActionState<VendorState, FormData>(saveCategoryAction, {});

  return (
    <form
      action={action}
      className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
    >
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--text)]">
          {row ? `Edit ${row.name}` : "New category"}
        </p>
        <button type="button" onClick={onDone} aria-label="Close">
          <X className="size-4 text-[var(--text-muted)]" />
        </button>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <Field label="Name" htmlFor="cat-name" required>
        <Input id="cat-name" name="name" required defaultValue={row?.name} placeholder="Utilities" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kind" htmlFor="cat-kind">
          <Select id="cat-kind" name="kind" defaultValue={row?.kind ?? "OPERATING"}>
            {CATEGORY_KINDS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Code" htmlFor="cat-code" hint="What the bursar's ledger calls it.">
          <Input id="cat-code" name="code" defaultValue={row?.code ?? ""} placeholder="5100" />
        </Field>
      </div>

      <Field label="Order on the statement" htmlFor="cat-order">
        <Input
          id="cat-order"
          name="sortOrder"
          inputMode="numeric"
          defaultValue={String(row?.sortOrder ?? 0)}
        />
      </Field>

      <CheckboxField
        name="active"
        label="In use"
        description={
          row?.bills
            ? `${row.bills} bill${row.bills === 1 ? "" : "s"} already use this. Turning it off keeps them and takes it out of the picker.`
            : "Off takes it out of the picker without losing anything."
        }
        defaultChecked={row?.active ?? true}
      />

      <SubmitRow label={row ? "Save" : "Add category"} />
    </form>
  );
}

function VendorForm({ row, onDone }: { row?: VendorRow; onDone: () => void }) {
  const [state, action] = useActionState<VendorState, FormData>(saveVendorAction, {});

  return (
    <form
      action={action}
      className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
    >
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--text)]">
          {row ? `Edit ${row.name}` : "New vendor"}
        </p>
        <button type="button" onClick={onDone} aria-label="Close">
          <X className="size-4 text-[var(--text-muted)]" />
        </button>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <Field label="Name" htmlFor="ven-name" required>
        <Input id="ven-name" name="name" required defaultValue={row?.name} />
      </Field>
      <Field label="What they supply" htmlFor="ven-supplies">
        <Input
          id="ven-supplies"
          name="supplies"
          defaultValue={row?.supplies ?? ""}
          placeholder="Stationery and printing"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contact" htmlFor="ven-contact">
          <Input id="ven-contact" name="contactName" defaultValue={row?.contactName ?? ""} />
        </Field>
        <Field label="Phone" htmlFor="ven-phone">
          <Input id="ven-phone" name="phone" defaultValue={row?.phone ?? ""} />
        </Field>
        <Field label="Email" htmlFor="ven-email">
          <Input id="ven-email" name="email" type="email" defaultValue={row?.email ?? ""} />
        </Field>
        <Field
          label="TIN"
          htmlFor="ven-tin"
          hint="Needed for the withholding tax return."
        >
          <Input id="ven-tin" name="tin" defaultValue={row?.tin ?? ""} />
        </Field>
        <Field label="Bank" htmlFor="ven-bank">
          <Input id="ven-bank" name="bankName" defaultValue={row?.bankName ?? ""} />
        </Field>
        <Field label="Account" htmlFor="ven-account">
          <Input id="ven-account" name="bankAccount" defaultValue={row?.bankAccount ?? ""} />
        </Field>
        <Field label="Mobile money" htmlFor="ven-momo">
          <Input id="ven-momo" name="momoNumber" defaultValue={row?.momoNumber ?? ""} />
        </Field>
        <Field label="Address" htmlFor="ven-address">
          <Input id="ven-address" name="address" defaultValue={row?.address ?? ""} />
        </Field>
      </div>

      <Field label="Notes" htmlFor="ven-notes">
        <Textarea id="ven-notes" name="notes" rows={2} defaultValue={row?.notes ?? ""} />
      </Field>

      <CheckboxField
        name="active"
        label="In use"
        description="Off takes them out of the picker. Their bills stay."
        defaultChecked={row?.active ?? true}
      />

      <SubmitRow label={row ? "Save" : "Add vendor"} />
    </form>
  );
}

function SubmitRow({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}
