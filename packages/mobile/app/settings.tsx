import { SettingsView } from "@/features/settings/components/SettingsView";

/** 設定画面（authenticated はログアウト + アカウント削除、guest はサインイン導線。SS-57 / SS-62）。 */
export default function SettingsRoute() {
  return <SettingsView />;
}
