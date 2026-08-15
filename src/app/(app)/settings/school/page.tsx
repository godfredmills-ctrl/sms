import type { Metadata } from "next";

import {
  Alert,
  Card,
  CardBody,
  DescriptionList,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";

import { SchoolForm, type SchoolValues } from "./school-form";

export const metadata: Metadata = { title: "School profile" };
export const dynamic = "force-dynamic";

export default async function SchoolSettingsPage() {
  const user = await requirePermission("settings.read");
  const canEdit = userCan(user, "settings.school.manage");

  const school = await db.school.findFirst({ orderBy: { createdAt: "asc" } });

  if (!school) {
    return (
      <Card>
        <EmptyState
          title="No school record"
          description="Run the seed, or create a school record, before configuring the system."
        />
      </Card>
    );
  }

  const branding = (school.branding ?? {}) as Record<string, string>;

  const values: SchoolValues = {
    id: school.id,
    name: school.name,
    shortName: school.shortName ?? "",
    motto: school.motto ?? "",
    email: school.email ?? "",
    phone: school.phone ?? "",
    altPhone: school.altPhone ?? "",
    website: school.website ?? "",
    addressLine1: school.addressLine1 ?? "",
    addressLine2: school.addressLine2 ?? "",
    city: school.city ?? "",
    region: school.region ?? "",
    digitalAddr: school.digitalAddr ?? "",
    postalBox: school.postalBox ?? "",
    registrationNo: school.registrationNo ?? "",
    logoUrl: school.logoUrl ?? "",
    crestUrl: school.crestUrl ?? "",
    curricula: school.curricula,
    brandPrimary: branding.primary ?? "#2C66CE",
    brandAccent: branding.accent ?? "#0E9F6E",
    reportHeader: branding.reportHeader ?? school.name,
  };

  return (
    <>
      <PageHeader
        title="School profile"
        description="The identity used across report cards, invoices, certificates and the website."
      />

      {canEdit ? (
        <SchoolForm values={values} />
      ) : (
        <div className="space-y-4">
          <Alert tone="info">
            You can view these settings but not change them. Ask an administrator for
            the &ldquo;Edit school profile and branding&rdquo; permission.
          </Alert>
          <Card>
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Name", value: values.name },
                  { label: "Short name", value: values.shortName || "—" },
                  { label: "Motto", value: values.motto || "—", span: true },
                  { label: "Email", value: values.email || "—" },
                  { label: "Phone", value: values.phone || "—" },
                  {
                    label: "Address",
                    value:
                      [values.addressLine1, values.city, values.region]
                        .filter(Boolean)
                        .join(", ") || "—",
                    span: true,
                  },
                  { label: "Ghana Post GPS", value: values.digitalAddr || "—" },
                  { label: "Registration no.", value: values.registrationNo || "—" },
                  {
                    label: "Curricula",
                    value: values.curricula.join(", ") || "—",
                    span: true,
                  },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
