import { requireUser, hasPermission, type Permission } from "@/modules/auth";
import { isFeatureEnabled, type Feature } from "@/shared/config/features";
import { AppShell, type NavItem } from "./app-shell";

const NAV: Array<NavItem & { permission?: Permission; feature?: Feature }> = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/members", label: "Members", icon: "users", permission: "members:read" },
  { href: "/attendance", label: "Practices", icon: "check", permission: "attendance:read" },
  { href: "/whatsapp-groups", label: "WhatsApp", icon: "chat", permission: "groups:read" },
  { href: "/birthdays", label: "Birthdays", icon: "cake", permission: "birthdays:read" },
  { href: "/carpool", label: "Lifts home", icon: "car", permission: "carpool:read", feature: "liftsHome" },
  { href: "/access", label: "Access & roles", icon: "shield", permission: "users:manage" },
  { href: "/settings", label: "Settings", icon: "cog", permission: "settings:manage" },
];

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const items = NAV.filter((item) => !item.permission || hasPermission(user.role, item.permission))
    .filter((item) => !item.feature || isFeatureEnabled(item.feature))
    .map(({ permission: _permission, feature: _feature, ...item }) => item);
  return (
    <AppShell items={items} user={{ name: user.name, email: user.email, role: user.role }}>
      {children}
    </AppShell>
  );
}
