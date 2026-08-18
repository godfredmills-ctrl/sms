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
    db.school.findFirst({
      select: { name: true, shortName: true, logoUrl: true },
    }),
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
 * Marks anything the signed-in user cannot reach as locked, rather than
 * removing it.
 *
 * Hiding was the older behaviour and it had a cost: two people looking at
 * the same product saw different applications, and someone who needed the
 * fee ledger had no way to discover it existed, let alone what to ask their
 * administrator for. A padlocked row answers both — and it is not a
 * security question, because the page, the action and the query each
 * enforce the permission on their own.
 */
function filterNavigation(
  groups: NavGroup[],
  user: Parameters<typeof userCanAny>[0] & { roleKeys: string[] },
): NavGroup[] {
  const allowAll = isSuperAdmin(user);
  const permitted = (permissions?: string[]) =>
    allowAll || !permissions || userCanAny(user, permissions);

  return groups
    .map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        locked: !permitted(item.permissions),
        children: item.children?.map((child) => ({
          ...child,
          // A child inside a locked parent is locked too, whatever it
          // declares — the parent's permission gates the segment.
          locked: !permitted(item.permissions) || !permitted(child.permissions),
        })),
      })),
    }))
    .filter((group) => group.items.length > 0);
}
