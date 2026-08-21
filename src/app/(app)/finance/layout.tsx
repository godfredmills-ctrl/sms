import type { ReactNode } from "react";

import { TabNav, type Tab } from "@/components/tab-nav";
import { requirePermission, userCan } from "@/lib/auth";

export default async function FinanceLayout({ children }: { children: ReactNode }) {
  // Any of the three, because the module now holds two different jobs. Gated
  // on finance.read alone, a procurement role with only the expenditure
  // permissions would be turned away by the layout before its own pages could
  // let it in — every tab it was given, refused at the door.
  const user = await requirePermission([
    "finance.read",
    "finance.expense.read",
    "finance.report",
  ]);

  const tabs: Tab[] = [
    // Gated like the rest. Left unconditional, the three fee tabs appeared for
    // anybody the layout let in — including a role with only the expenditure
    // permissions, for whom all three led straight to a refusal.
    ...(userCan(user, "finance.read")
      ? [
          { href: "/finance", label: "Overview" },
          { href: "/finance/invoices", label: "Invoices" },
          { href: "/finance/payments", label: "Payments" },
        ]
      : []),
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
