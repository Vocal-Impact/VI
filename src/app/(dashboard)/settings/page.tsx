import { requirePermission } from "@/modules/auth";
import { getSettings } from "@/shared/settings/settings";
import { NumberSetting, TemplateSetting, VenueSetting } from "./setting-forms";

export const metadata = { title: "Settings" };

export default async function GeneralSettingsPage() {
  await requirePermission("settings:manage");
  const settings = await getSettings();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <NumberSetting
        settingKey="attendanceThreshold"
        title="Practices before WhatsApp groups"
        description="Prospective members become eligible after this many practices."
        value={settings.attendanceThreshold}
        min={1}
        max={20}
      />
      <NumberSetting
        settingKey="inactiveAfterWeeks"
        title="“Stopped coming” after (weeks)"
        value={settings.inactiveAfterWeeks}
        min={1}
        max={52}
      />
      <TemplateSetting value={settings.inviteMessageTemplate} />
      <VenueSetting value={settings.practiceVenue} />
      <NumberSetting
        settingKey="carpoolClusterRadiusKm"
        title="Carpool: neighbours within (km)"
        value={settings.carpoolClusterRadiusKm}
        step={0.5}
        min={0.5}
        max={20}
      />
      <NumberSetting
        settingKey="carpoolMaxDetourKm"
        title="Carpool: maximum driver detour (km)"
        value={settings.carpoolMaxDetourKm}
        step={0.5}
        min={0.5}
        max={20}
      />
    </div>
  );
}
