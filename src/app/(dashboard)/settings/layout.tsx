import { requirePermission } from "@/modules/auth";
import { PageHeader } from "@/shared/ui/layout";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  await requirePermission("settings:manage");
  return (
    <>
      <PageHeader title="Settings" description="Admin only." />
      <SettingsTabs />
      <div className="mt-6">{children}</div>
    </>
  );
}
