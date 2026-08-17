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
      select: { name: true, shortName: true, logoUrl: true, branding: true },
    }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  const navigation = filterNavigation(navigationFor(user.portal), user);

  // The school's brand primary, applied to the whole application. It reaches
  // the CSS as one custom property; globals.css derives everything else from
  // it — hover, soft backgrounds, the focus ring, the sidebar — with a
  // lightened variant in dark mode so a deep brand colour stays visible.
  // Restricted to six-digit hex: this string lands in a style attribute, and
  // hex is the one shape that cannot smuggle anything else in.
  const branding = (school?.branding ?? {}) as Record<string, string>;
  const brandPrimary = /^#[0-9a-fA-F]{6}$/.test(branding.primary ?? "")
    ? branding.primary
    : null;

  return (
    <div
      data-brand={brandPrimary ? "" : undefined}
      style={
        brandPrimary
          ? ({ "--brand-primary": brandPrimary } as React.CSSProperties)
          : undefined
      }
      className="contents"
    >
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
    </div>
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
