import type { ReactNode } from "react";

import { TabNav, type Tab } from "@/components/tab-nav";
import { requireUser } from "@/lib/auth";

const TABS: Tab[] = [
  { href: "/portal/student", label: "Overview" },
  { href: "/portal/student/courses", label: "Courses" },
  { href: "/portal/student/assignments", label: "Assignments" },
  { href: "/portal/student/results", label: "Results" },
  { href: "/portal/student/credentials", label: "Certificates" },
  { href: "/portal/student/timetable", label: "Timetable" },
  { href: "/portal/student/attendance", label: "Attendance" },
  { href: "/portal/student/fees", label: "Fees" },
  { href: "/portal/student/announcements", label: "Announcements" },
];

export default async function StudentPortalLayout({
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
