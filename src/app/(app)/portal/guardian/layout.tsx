import type { ReactNode } from "react";

import { TabNav, type Tab } from "@/components/tab-nav";
import { requireUser } from "@/lib/auth";

const TABS: Tab[] = [
  { href: "/portal/guardian", label: "Overview" },
  { href: "/portal/guardian/children", label: "Children" },
  { href: "/portal/guardian/results", label: "Results" },
  { href: "/portal/guardian/credentials", label: "Certificates" },
  { href: "/portal/guardian/attendance", label: "Attendance" },
  { href: "/portal/guardian/fees", label: "Fee account" },
  { href: "/portal/guardian/payments", label: "Payments" },
  { href: "/portal/guardian/documents", label: "Documents" },
  { href: "/portal/guardian/calendar", label: "Calendar" },
  { href: "/portal/guardian/announcements", label: "Announcements" },
];

export default async function GuardianPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();

  return (
    <>
      <TabNav tabs={TABS} />
      {children}
    </>
  );
}
