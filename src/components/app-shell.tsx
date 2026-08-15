"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { Bell, ChevronDown, LogOut, Menu, Moon, Search, Sun, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavGroup } from "@/lib/navigation";
import { Avatar, Badge } from "@/components/ui";

type ShellUser = {
  id: string;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
  roleNames: string[];
  portal: "STAFF" | "STUDENT" | "GUARDIAN";
};

/**
 * The application frame: a persistent sidebar on desktop, a slide-over on
 * mobile, and a header carrying search, notifications and the account menu.
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

  // Any navigation closes the mobile drawer.
  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  // Lock body scroll behind the drawer.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-dvh">
      {/* ---------------------------------------------------------------- */}
      {/* Sidebar                                                           */}
      {/* ---------------------------------------------------------------- */}
      <aside
        className={cn(
          "sidebar fixed inset-y-0 left-0 z-50 flex w-64 flex-col",
          "transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b px-4">
          {schoolLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={schoolLogo}
              alt=""
              className="size-9 rounded-lg bg-white/10 object-contain p-1"
            />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-lg bg-white/15 text-sm font-bold ring-1 ring-white/25">
              {schoolName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {schoolName}
          </span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navigation.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              <p className="mb-1.5 px-2 text-[10px] font-semibold tracking-wider text-[var(--sidebar-faint)] uppercase">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <NavEntry key={item.href} item={item} pathname={pathname} />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t p-3">
          <ThemeToggle />
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

      {/* ---------------------------------------------------------------- */}
      {/* Main                                                              */}
      {/* ---------------------------------------------------------------- */}
      <div className="lg:pl-64">
        <header className="app-header sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]/85 px-4 backdrop-blur-md">
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

          <div className="ml-auto flex items-center gap-1.5">
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
                    <Link
                      href="/account/password"
                      className="block rounded px-3 py-2 text-sm hover:bg-[var(--bg-subtle)]"
                    >
                      Change password
                    </Link>
                    <Link
                      href="/account/notifications"
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
}: {
  item: NavGroup["items"][number];
  pathname: string;
}) {
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
  const [open, setOpen] = useState(isActive);

  const Icon =
    (Icons[item.icon as keyof typeof Icons] as React.ComponentType<{
      className?: string;
    }>) ?? Icons.Circle;

  return (
    <li>
      <div className="flex items-center">
        <Link
          href={item.href}
          data-active={isActive}
          className="sidebar-link flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 text-sm"
        >
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
        {item.children?.length ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
            aria-expanded={open}
            className="rounded p-1 text-[var(--sidebar-faint)] hover:bg-white/10 hover:text-white"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
            />
          </button>
        ) : null}
      </div>

      {item.children?.length && open ? (
        <ul className="mt-0.5 mb-1 ml-4 space-y-0.5 border-l pl-3">
          {item.children.map((child) => (
            <li key={child.href}>
              <Link
                href={child.href}
                data-active={pathname === child.href}
                className="sidebar-link block rounded px-2 py-1.5 text-[13px]"
              >
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

// -----------------------------------------------------------------------------
// Theme
// -----------------------------------------------------------------------------

/**
 * Light is the default and the OS setting is not followed, so the choice here
 * is a plain two-way switch. A "System" option would be misleading — it would
 * simply mean light.
 */
function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Anything other than an explicit "dark" (including a "system" value left
    // over from before) resolves to light.
    setTheme(window.localStorage.getItem("theme") === "dark" ? "dark" : "light");
  }, []);

  function apply(next: "light" | "dark") {
    setTheme(next);
    window.localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg bg-white/10 p-0.5"
      role="group"
      aria-label="Colour theme"
    >
      {(
        [
          { value: "light", icon: Sun, label: "Light" },
          { value: "dark", icon: Moon, label: "Dark" },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => apply(option.value)}
          aria-pressed={theme === option.value}
          title={option.label}
          className={cn(
            "flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors",
            theme === option.value
              ? "bg-white/90 text-[var(--sidebar-to)] shadow-sm"
              : "text-white/60 hover:text-white",
          )}
        >
          <option.icon className="size-3.5" />
          <span className="sr-only">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
