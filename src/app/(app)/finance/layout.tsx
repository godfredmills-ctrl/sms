import type { ReactNode } from "react";

import { TabNav, type Tab } from "@/components/tab-nav";
import { requirePermission, userCan } from "@/lib/auth";

export default async function FinanceLayout({ children }: { children: ReactNode }) {
  const user = await requirePermission("finance.read");

  const tabs: Tab[] = [
    { href: "/finance", label: "Overview" },
    { href: "/finance/invoices", label: "Invoices" },
    { href: "/finance/payments", label: "Payments" },
    // The other half of the ledger. Money out sits beside money in rather
    // than in a module of its own, because the statement at the end needs
    // both and nobody thinks of them as separate jobs.
    ...(userCan(user, "finance.expense.read")
      ? [
          { href: "/finance/expenses", label: "Expenditure" },
          { href: "/finance/vendors", label: "Vendors" },
        ]
      : []),
    ...(userCan(user, "finance.report")
      ? [{ href: "/finance/statement", label: "Statement" }]
      : []),
    ...(userCan(user, "finance.budget.manage")
      ? [{ href: "/finance/budget", label: "Budget" }]
      : []),
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
