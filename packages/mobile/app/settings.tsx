import { SettingsView } from "@/features/settings/components/SettingsView";

/** 設定画面（authenticated はログアウト導線、guest はサインイン導線。SS-57）。 */
export default function SettingsRoute() {
  return <SettingsView />;
}
