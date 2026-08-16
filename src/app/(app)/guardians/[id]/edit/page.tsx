import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";

import { GuardianForm } from "../../guardian-form";

export const metadata: Metadata = { title: "Edit guardian" };
export const dynamic = "force-dynamic";

export default async function EditGuardianPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("student.guardian.manage");
  const { id } = await params;

  const guardian = await db.guardian.findUnique({ where: { id } });
  if (!guardian) notFound();

  return (
    <>
      <div className="mb-5">
        <Link
          href={`/guardians/${guardian.id}`}
          className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)]"
        >
          ← {fullName(guardian)}
        </Link>
        <PageHeader
          title={`Edit ${fullName(guardian)}`}
          description="Wards, logins and deletion live on the profile."
        />
      </div>

      <div className="mx-auto max-w-3xl">
        <GuardianForm
          values={{
            id: guardian.id,
            title: guardian.title ?? "",
            firstName: guardian.firstName,
            lastName: guardian.lastName,
            otherNames: guardian.otherNames ?? "",
            gender: guardian.gender,
            email: guardian.email ?? "",
            phone: guardian.phone,
            altPhone: guardian.altPhone ?? "",
            whatsapp: guardian.whatsapp ?? "",
            address: guardian.address ?? "",
            digitalAddr: guardian.digitalAddr ?? "",
            city: guardian.city ?? "",
            nationality: guardian.nationality ?? "Ghanaian",
            nationalId: guardian.nationalId ?? "",
            occupation: guardian.occupation ?? "",
            employer: guardian.employer ?? "",
            jobTitle: guardian.jobTitle ?? "",
            workPhone: guardian.workPhone ?? "",
            religion: guardian.religion ?? "",
            preferredChannel: guardian.preferredChannel,
            notes: guardian.notes ?? "",
          }}
        />
      </div>
    </>
  );
}
