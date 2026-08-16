"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { Modal } from "@/components/modal";
import { Button } from "@/components/ui";
import type { SelectOption } from "@/components/select-search";

import { AdmissionForm } from "./new/admission-form";

/**
 * Admission in a modal over the students list.
 *
 * The modal stays open on success: the panel shows the allocated admission
 * number, and that is the thing the registrar writes on the paper file. The
 * table behind is refreshed the moment the admission lands.
 */
export function AdmitStudentButton({
  sections,
  documentCategories,
}: {
  sections: SelectOption[];
  documentCategories: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const refresh = useCallback(() => router.refresh(), [router]);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        Admit student
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Admit a student"
        description="Guardian details are captured on the same form — a record with no contactable adult is the most common gap in a school database."
        wide
      >
        <AdmissionForm
          sections={sections}
          documentCategories={documentCategories}
          onSuccess={refresh}
        />
      </Modal>
    </>
  );
}
