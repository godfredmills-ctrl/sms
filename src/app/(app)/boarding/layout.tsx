import type { ReactNode } from "react";

import { TabNav, type Tab } from "@/components/tab-nav";
import { requirePermission, userCan } from "@/lib/auth";

export default async function BoardingLayout({ children }: { children: ReactNode }) {
  const user = await requirePermission(["boarding.read", "boarding.manage", "boarding.gate"]);

  const tabs: Tab[] = [
    { href: "/boarding", label: "Overview" },
    { href: "/boarding/exeat", label: "Leave-out" },
    ...(userCan(user, "boarding.manage")
      ? [{ href: "/boarding/houses", label: "Houses & rooms" }]
      : []),
  ];

  return (
    <>
      <TabNav tabs={tabs} />
      {children}
    </>
  );
}
