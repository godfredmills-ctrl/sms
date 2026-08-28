"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, UserX } from "lucide-react";

import { Modal } from "@/components/modal";
import { Button } from "@/components/ui";

import { GuardianStatusCard } from "../status-card";

/**
 * Deactivate, or reactivate, from the guardian's own page.
 *
 * The same panel the list opens, so there is one description of what
 * deactivating does and one form that does it.
 */
export function GuardianStatusButton({
  guardianId,
  name,
  isActive,
  reason,
}: {
  guardianId: string;
  name: string;
  isActive: boolean;
  reason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const done = useCallback(() => {
    router.refresh();
    setOpen(false);
  }, [router]);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className={isActive ? "text-[var(--danger)]" : undefined}
      >
        {isActive ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
        {isActive ? "Deactivate" : "Reactivate"}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isActive ? `Deactivate ${name}` : `Reactivate ${name}`}
      >
        <GuardianStatusCard
          guardianId={guardianId}
          name={name}
          isActive={isActive}
          reason={reason}
          onDone={done}
        />
      </Modal>
    </>
  );
}
