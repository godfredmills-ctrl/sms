import type { ReactNode } from "react";

import { TabNav, type Tab } from "@/components/tab-nav";
import { requirePermission, userCan } from "@/lib/auth";

export default async function ExamsLayout({ children }: { children: ReactNode }) {
  // Read, not manage: a teacher invigilating on Thursday morning needs the
  // timetable and the hall they are in, and does not set the examinations up.
  const user = await requirePermission([
    "assessment.exam.read",
    "assessment.exam.manage",
    "assessment.exam.attendance",
  ]);

  const tabs: Tab[] = [
    { href: "/exams", label: "Examinations" },
    ...(userCan(user, "assessment.exam.manage")
      ? [{ href: "/exams/venues", label: "Halls" }]
      : []),
  ];

  return (
    <>
      <TabNav tabs={tabs} />
      {children}
    </>
  );
}
