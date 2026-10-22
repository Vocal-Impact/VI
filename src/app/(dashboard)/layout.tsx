import { requireUser, hasPermission, type Permission } from "@/modules/auth";
import { isFeatureEnabled, type Feature } from "@/shared/config/features";
import { AppShell, type NavItem } from "./app-shell";

/** `permission`: shown to anyone with one of these. */
const NAV: Array<NavItem & { permission?: Permission | Permission[]; feature?: Feature }> = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/members", label: "Members", icon: "users", permission: "members:read" },
  // Committee: every practice. Batch leads: their own level's practices.
  { href: "/attendance", label: "Practices", icon: "check", permission: ["attendance:read", "practices:level-manage"] },
  { href: "/alumni", label: "Alumni practices", icon: "alumni", permission: "practices:alumni-manage" },
  { href: "/song-bank", label: "Song bank", icon: "library", permission: "songbank:read", feature: "songBank" },
  { href: "/whatsapp-groups", label: "WhatsApp", icon: "chat", permission: "groups:read" },
  { href: "/birthdays", label: "Birthdays", icon: "cake", permission: "birthdays:read" },
  { href: "/carpool", label: "Lifts home", icon: "car", permission: "carpool:read", feature: "liftsHome" },
  { href: "/access", label: "Access & roles", icon: "shield", permission: "users:manage" },
  { href: "/settings", label: "Settings", icon: "cog", permission: "settings:manage" },
];

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const items = NAV.filter(
    (item) => !item.permission || [item.permission].flat().some((permission) => hasPermission(user.role, permission)),
  )
    .filter((item) => !item.feature || isFeatureEnabled(item.feature))
    .map(({ permission: _permission, feature: _feature, ...item }) => item);
  return (
    <AppShell items={items} user={{ name: user.name, email: user.email, role: user.role }}>
      {children}
    </AppShell>
  );
}
