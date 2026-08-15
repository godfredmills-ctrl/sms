import type { ReactNode } from "react";

import { TabNav, type Tab } from "@/components/tab-nav";
import { requirePermission, userCan } from "@/lib/auth";

export default async function AcademicsLayout({ children }: { children: ReactNode }) {
  const user = await requirePermission("academic.structure.read");

  const tabs: Tab[] = [
    { href: "/academics/classes", label: "Class sections" },
    { href: "/academics/subjects", label: "Subjects" },
    ...(userCan(user, "academic.year.manage")
      ? [{ href: "/academics/years", label: "Academic years" }]
      : []),
    ...(userCan(user, "academic.timetable.read")
      ? [{ href: "/academics/timetable", label: "Timetable" }]
      : []),
  ];

  return (
    <>
      <TabNav tabs={tabs} />
      {children}
    </>
  );
}
