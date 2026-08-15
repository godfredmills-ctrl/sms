"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type Tab = { href: string; label: string };

/**
 * Section tabs for routes that share a layout. Active state comes from the
 * pathname rather than a prop, so a section can add pages without every
 * caller having to say which one it is on.
 */
export function TabNav({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();

  // Longest matching prefix wins, so an overview tab at /finance does not stay
  // lit while you are on /finance/invoices.
  const activeHref = tabs
    .filter((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="-mx-1 mb-5 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-[var(--border)] px-1">
        {tabs.map((tab) => {
          const active = tab.href === activeHref;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-9 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-[var(--primary)] text-[var(--primary)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
