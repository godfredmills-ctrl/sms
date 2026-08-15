import type { ReactNode } from "react";

import { TabNav, type Tab } from "@/components/tab-nav";
import { requirePermission, userCan } from "@/lib/auth";

export default async function FinanceLayout({ children }: { children: ReactNode }) {
  const user = await requirePermission("finance.read");

  const tabs: Tab[] = [
    { href: "/finance", label: "Overview" },
    { href: "/finance/invoices", label: "Invoices" },
    { href: "/finance/payments", label: "Payments" },
    ...(userCan(user, "finance.fee.manage")
      ? [{ href: "/finance/structures", label: "Fee structures" }]
      : []),
    ...(userCan(user, "finance.discount.manage")
      ? [{ href: "/finance/discounts", label: "Discounts" }]
      : []),
    ...(userCan(user, "finance.reminder.manage")
      ? [{ href: "/finance/reminders", label: "Reminders" }]
      : []),
  ];

  return (
    <>
      <TabNav tabs={tabs} />
      {children}
    </>
  );
}
