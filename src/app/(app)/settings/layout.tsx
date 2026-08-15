import type { ReactNode } from "react";

import { TabNav, type Tab } from "@/components/tab-nav";
import { requirePermission, userCan } from "@/lib/auth";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await requirePermission("settings.read");

  // Tabs are derived from permissions rather than hidden behind a redirect, so
  // a bursar never sees a "Custom fields" tab that would only bounce them.
  const tabs: Tab[] = [
    { href: "/settings/school", label: "School profile" },
    ...(userCan(user, "settings.option.manage")
      ? [{ href: "/settings/options", label: "Dropdown options" }]
      : []),
    ...(userCan(user, "settings.customfield.manage")
      ? [{ href: "/settings/custom-fields", label: "Custom fields" }]
      : []),
    ...(userCan(user, "assessment.scale.manage")
      ? [{ href: "/settings/grading", label: "Grading scales" }]
      : []),
    ...(userCan(user, "settings.integration.manage")
      ? [{ href: "/settings/integrations", label: "Integrations" }]
      : []),
  ];

  return (
    <>
      <TabNav tabs={tabs} />
      {children}
    </>
  );
}
