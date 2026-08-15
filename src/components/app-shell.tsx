"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavGroup, NavItem } from "@/lib/navigation";
import { Avatar, Badge } from "@/components/ui";

type ShellUser = {
  id: string;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
  roleNames: string[];
  portal: "STAFF" | "STUDENT" | "GUARDIAN";
};

/** Resolves a Lucide icon by name, falling back to a neutral dot. */
function iconFor(name: string | undefined) {
  return (
    (Icons[name as keyof typeof Icons] as React.ComponentType<{
      className?: string;
    }>) ?? Icons.Circle
  );
}

/**
 * The application frame.
 *
 * The sidebar collapses to an icon rail. Collapsed, hovering an item reveals
 * its label as a tooltip, or its submenu as a flyout — so nothing becomes
 * unreachable, which is the usual failure of icon-only navigation.
 */
export function AppShell({
  user,
  navigation,
  schoolName,
  schoolLogo,
  unreadCount,
  children,
}: {
  user: ShellUser;
  navigation: NavGroup[];
  schoolName: string;
  schoolLogo?: string | null;
  unreadCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("sidebar:collapsed") === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      window.localStorage.setItem("sidebar:collapsed", value ? "0" : "1");
      return !value;
    });
  }

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // The rail is always full width on mobile; collapsing is a desktop affordance.
  const width = collapsed ? "lg:w-[72px]" : "lg:w-64";

  return (
    <div className="min-h-dvh">
      <aside
        className={cn(
          "sidebar fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r",
          width,
          "transition-[width,transform] duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* ---------------------------------------------------------------- */}
        {/* Brand                                                             */}
        {/* ---------------------------------------------------------------- */}
        <div
          className={cn(
            "flex h-16 shrink-0 items-center gap-2.5 border-b px-4",
            collapsed && "lg:justify-center lg:px-2",
          )}
        >
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            {schoolLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={schoolLogo}
                alt=""
                className="size-9 shrink-0 rounded-lg object-contain"
              />
            ) : (
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                style={{ background: "var(--sidebar-active-bg)" }}
              >
                {schoolName.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span
              className={cn(
                "min-w-0 truncate text-sm font-semibold",
                collapsed && "lg:hidden",
              )}
            >
              {schoolName}
            </span>
          </Link>

          {/* Desktop collapse control */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "ml-auto hidden size-6 items-center justify-center rounded-full border",
              "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text)]",
              collapsed ? "lg:hidden" : "lg:flex",
            )}
          >
            <ChevronLeft className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="ml-auto rounded p-1 text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] lg:hidden"
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Expand control, only meaningful once collapsed */}
        {collapsed ? (
          <div className="hidden justify-center py-2 lg:flex">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              className="flex size-7 items-center justify-center rounded-full border text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text)]"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Navigation                                                        */}
        {/* ---------------------------------------------------------------- */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 scrollbar-none">
          {navigation.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              {collapsed ? (
                <div className="mx-auto mb-2 hidden h-px w-6 bg-[var(--sidebar-line)] lg:block" />
              ) : null}
              <p
                className={cn(
                  "mb-1.5 px-2 text-[10px] font-semibold tracking-wider text-[var(--sidebar-faint)] uppercase",
                  collapsed && "lg:hidden",
                )}
              >
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <NavEntry
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    collapsed={collapsed}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* ---------------------------------------------------------------- */}
        {/* Help                                                              */}
        {/* ---------------------------------------------------------------- */}
        <div className="shrink-0 p-3">
          {collapsed ? (
            <Link
              href="/help"
              aria-label="Help centre"
              className="mx-auto hidden size-10 items-center justify-center rounded-lg bg-[var(--sidebar-hover)] text-[var(--sidebar-text)] lg:flex"
            >
              <LifeBuoy className="size-5" />
            </Link>
          ) : (
            <Link
              href="/help"
              className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-[var(--sidebar-hover)]"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sidebar-hover)]">
                <LifeBuoy className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">Need help?</span>
                <span className="block text-xs text-[var(--sidebar-faint)]">
                  Go to Help Centre →
                </span>
              </span>
            </Link>
          )}
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Main                                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        <header className="app-header sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]/85 px-4 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>

          <Link
            href="/search"
            className="hidden min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-subtle)] transition-colors hover:border-[var(--border-strong)] sm:flex sm:max-w-sm"
          >
            <Search className="size-4" />
            Search students, staff, invoices…
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />

            <Link
              href="/notifications"
              className="relative rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
            >
              <Bell className="size-4.5" />
              {unreadCount > 0 ? (
                <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-[var(--danger)] text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>

            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((value) => !value)}
                className="flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 hover:bg-[var(--bg-subtle)]"
                aria-expanded={accountOpen}
              >
                <Avatar name={user.fullName} src={user.avatarUrl} size={30} />
                <span className="hidden text-left sm:block">
                  <span className="block max-w-32 truncate text-xs font-medium">
                    {user.fullName}
                  </span>
                  <span className="block max-w-32 truncate text-[10px] text-[var(--text-subtle)]">
                    {user.roleNames[0] ?? "Member"}
                  </span>
                </span>
                <ChevronDown className="size-3.5 text-[var(--text-subtle)]" />
              </button>

              {accountOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close account menu"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setAccountOpen(false)}
                  />
                  <div className="card absolute right-0 z-50 mt-1.5 w-60 overflow-hidden p-1 shadow-lg">
                    <div className="border-b border-[var(--border)] px-3 py-2.5">
                      <p className="truncate text-sm font-medium">{user.fullName}</p>
                      <p className="truncate text-xs text-[var(--text-subtle)]">
                        {user.email}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {user.roleNames.slice(0, 2).map((role) => (
                          <Badge key={role} tone="primary">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Link
                      href="/account"
                      className="block rounded px-3 py-2 text-sm hover:bg-[var(--bg-subtle)]"
                    >
                      My account
                    </Link>
                    {/* Both live as sections of /account rather than routes of
                        their own — a password field and a preference grid do not
                        each need a page, and the fragment lands on the right one. */}
                    <Link
                      href="/account#password"
                      className="block rounded px-3 py-2 text-sm hover:bg-[var(--bg-subtle)]"
                    >
                      Change password
                    </Link>
                    <Link
                      href="/account#notifications"
                      className="block rounded px-3 py-2 text-sm hover:bg-[var(--bg-subtle)]"
                    >
                      Notification settings
                    </Link>
                    <form action="/api/auth/logout" method="post">
                      <button
                        type="submit"
                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                      >
                        <LogOut className="size-4" />
                        Sign out
                      </button>
                    </form>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Navigation entry
// -----------------------------------------------------------------------------

function NavEntry({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
  const [open, setOpen] = useState(isActive);

  const Icon = iconFor(item.icon);
  const hasChildren = Boolean(item.children?.length);

  // ---- Collapsed rail --------------------------------------------------
  if (collapsed) {
    return (
      <li className="rail-item relative hidden lg:block">
        <Link
          href={item.href}
          data-active={isActive}
          aria-label={item.label}
          className="sidebar-link justify-center px-0 py-2.5"
        >
          <Icon className="size-5 shrink-0" />
        </Link>

        <div className="rail-pop">
          {hasChildren ? (
            <div className="rail-flyout">
              <p className="px-2 py-1.5 text-xs font-semibold text-[var(--sidebar-text)]">
                {item.label}
              </p>
              <ul className="nav-tree mt-0.5 ml-3">
                {item.children?.map((child) => {
                  const ChildIcon = iconFor(child.icon);
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        data-active={pathname === child.href}
                        className="sidebar-link py-1.5 text-[13px]"
                      >
                        <ChildIcon className="size-3.5 shrink-0" />
                        <span className="truncate">{child.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="rail-tooltip mt-1.5">{item.label}</div>
          )}
        </div>
      </li>
    );
  }

  // ---- Expanded --------------------------------------------------------
  return (
    <li>
      <div className="flex items-center">
        <Link
          href={item.href}
          data-active={isActive}
          className="sidebar-link min-w-0 flex-1"
        >
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>

        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
            aria-expanded={open}
            className="ml-0.5 rounded p-1 text-[var(--sidebar-faint)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text)]"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
            />
          </button>
        ) : null}
      </div>

      {hasChildren && open ? (
        <ul className="nav-tree mt-0.5 mb-1 space-y-0.5">
          {item.children?.map((child) => {
            const ChildIcon = iconFor(child.icon);
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  data-active={pathname === child.href}
                  className="sidebar-link py-1.5 text-[13px]"
                >
                  <ChildIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{child.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

// -----------------------------------------------------------------------------
// Theme
// -----------------------------------------------------------------------------

/**
 * Light is the default and the OS setting is not followed, so this is a plain
 * two-way switch, sitting in the top bar where the sidebar can collapse
 * without taking it away.
 */
function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(window.localStorage.getItem("theme") === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      className="rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
    >
      {theme === "dark" ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
    </button>
  );
}
