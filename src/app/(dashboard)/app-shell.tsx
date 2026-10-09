"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Cake,
  Car,
  GraduationCap,
  Home,
  ListMusic,
  LogOut,
  Menu,
  MessageCircle,
  Mic2,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { authClient } from "@/modules/auth/client";
import { cn } from "@/shared/lib/cn";
import { LogoWordmark } from "@/shared/ui/music";

// Musical icon set: singers (members), set list (attendance), mixer faders (settings).
const ICONS = {
  home: Home,
  users: Mic2,
  check: ListMusic,
  chat: MessageCircle,
  cake: Cake,
  car: Car,
  alumni: GraduationCap,
  cog: SlidersHorizontal,
  shield: ShieldCheck,
} as const;

const ROLE_NAMES: Record<string, string> = {
  ADMIN: "admin",
  COMMITTEE: "committee",
  MEMBER: "member",
  ALUMNI: "alumni",
  ALUMNI_COMMITTEE: "alumni committee",
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  items,
  user,
  children,
}: {
  items: NavItem[];
  user: { name: string; email: string; role: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  const nav = (
    <nav aria-label="Main" className="space-y-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              active ? "bg-white text-ink shadow-sticker-brand" : "text-slate-300 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon
              className={cn("size-4 transition-transform group-hover:-rotate-6", active && "text-brand-600")}
              aria-hidden="true"
            />
            {item.label}
            {active ? (
              <span aria-hidden="true" className="ml-auto text-brand-600">
                ♪
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="border-t border-white/10 pt-4">
      <p className="truncate text-sm font-semibold text-white">{user.name}</p>
      <p className="truncate text-xs text-slate-400">
        {user.email} · {ROLE_NAMES[user.role] ?? user.role.toLowerCase()}
      </p>
      <button
        type="button"
        onClick={signOut}
        className="mt-3 flex items-center gap-2 text-sm text-slate-300 hover:text-white"
      >
        <LogOut className="size-4" aria-hidden="true" /> Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col justify-between bg-ink bg-staff p-4 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div>
          <Link href="/" className="mb-8 block px-2 pt-2" aria-label="Vocal Impact dashboard">
            <LogoWordmark variant="white" className="w-40" priority />
          </Link>
          {nav}
        </div>
        {account}
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between bg-ink px-4 py-2.5 lg:hidden">
        <Link href="/" aria-label="Vocal Impact dashboard">
          <LogoWordmark variant="white" className="w-28" priority />
        </Link>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="rounded-lg p-2 text-white hover:bg-white/10"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>
      {open ? (
        <div className="fixed inset-x-0 top-[57px] z-20 animate-fade-up space-y-4 bg-ink bg-staff p-4 shadow-2xl lg:hidden">
          {nav}
          {account}
        </div>
      ) : null}

      <main key={pathname} className="mx-auto w-full max-w-6xl flex-1 animate-fade-up px-4 py-6 sm:px-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
