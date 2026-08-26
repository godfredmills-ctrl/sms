import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { DOCUMENT_CATEGORIES } from "@/lib/person-documents";

import { GuardianForm } from "../guardian-form";

export const metadata: Metadata = { title: "Add guardian" };
export const dynamic = "force-dynamic";

export default async function NewGuardianPage() {
  await requirePermission("student.guardian.manage");

  return (
    <>
      <div className="mb-5">
        <Link
          href="/guardians"
          className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)]"
        >
          ← Guardians
        </Link>
        <PageHeader
          title="Add a guardian"
          description="Wards are linked from the profile afterwards. If this parent already has a child here, their record already exists: search first, because a duplicate splits one family's fees and reminders in two."
        />
      </div>

      <div className="mx-auto max-w-3xl">
        <GuardianForm documentCategories={DOCUMENT_CATEGORIES.guardian} />
      </div>
    </>
  );
}
