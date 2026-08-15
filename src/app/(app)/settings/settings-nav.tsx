"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type SettingsTab = { href: string; label: string };

export function SettingsNav({ tabs }: { tabs: SettingsTab[] }) {
  const pathname = usePathname();

  return (
    <nav className="mb-5 -mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-[var(--border)] px-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-9 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors",
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
