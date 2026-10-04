"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/cn";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/system", label: "System & data" },
  { href: "/settings/email-preview", label: "Email designs" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
              active ? "border-brand-700 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
