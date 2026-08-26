"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { Modal } from "@/components/modal";
import { Button } from "@/components/ui";

import { GuardianForm } from "./guardian-form";

export function AddGuardianButton({
  documentCategories,
}: {
  documentCategories: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const refresh = useCallback(() => router.refresh(), [router]);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        Add guardian
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a guardian"
        description="If this parent already has a child here, their record exists: a duplicate splits one family's fees in two."
        wide
      >
        <GuardianForm documentCategories={documentCategories} onSuccess={refresh} />
      </Modal>
    </>
  );
}
