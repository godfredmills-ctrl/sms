import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentUser, userCanAny } from "@/lib/auth";
import { db } from "@/lib/db";
import { navigationFor, type NavGroup } from "@/lib/navigation";
import { isSuperAdmin } from "@/lib/rbac";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [school, unreadCount] = await Promise.all([
    db.school.findFirst({ select: { name: true, shortName: true, logoUrl: true } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  const navigation = filterNavigation(navigationFor(user.portal), user);

  return (
    <AppShell
      user={{
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        roleNames: user.roleNames,
        portal: user.portal,
      }}
      navigation={navigation}
      schoolName={school?.shortName ?? school?.name ?? "School MS"}
      schoolLogo={school?.logoUrl}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}

/**
 * Strips out anything the signed-in user cannot reach, including empty
 * groups, so nobody is shown a link that leads to a permission wall.
 */
function filterNavigation(
  groups: NavGroup[],
  user: Parameters<typeof userCanAny>[0] & { roleKeys: string[] },
): NavGroup[] {
  const allowAll = isSuperAdmin(user);

  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => allowAll || !item.permissions || userCanAny(user, item.permissions))
        .map((item) => ({
          ...item,
          children: item.children?.filter(
            (child) => allowAll || !child.permissions || userCanAny(user, child.permissions),
          ),
        })),
    }))
    .filter((group) => group.items.length > 0);
}
