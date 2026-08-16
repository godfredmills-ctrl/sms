"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { Modal } from "@/components/modal";
import { Button } from "@/components/ui";
import type { SelectOption } from "@/components/select-search";

import { StaffForm } from "./staff-form";

/**
 * Opens the staff form in a modal over the list.
 *
 * On success the router refreshes so the table behind the modal already shows
 * the new row — but the modal stays open. The success message carries the
 * generated staff number, and closing over it would take the one thing the
 * administrator needs to write down.
 */
export function AddStaffButton({
  subjects,
  documentCategories,
}: {
  subjects: SelectOption[];
  documentCategories: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const refresh = useCallback(() => router.refresh(), [router]);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        Add staff
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a staff member"
        description="A login is created from their profile afterwards, linked to this record."
        wide
      >
        <StaffForm
          subjects={subjects}
          documentCategories={documentCategories}
          onSuccess={refresh}
        />
      </Modal>
    </>
  );
}
