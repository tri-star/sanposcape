import { Tabs } from "expo-router";

import { AppTabBar } from "@/features/navigation/components/AppTabBar";
import { usePinRegistrationGate } from "@/hooks/usePinRegistrationGate";

/**
 * タブナビゲーション（ナビ / ピン / アカウント。SS-145）。
 * ログイン直後の着地点はピンタブ（`features/auth/lib/landingHref.ts`）。
 * ピンタブの表示可否は pin_registration の判定を `AppTabBar` へ渡して決める
 * （`Tabs.Screen` の `href: null` は独自タブバーには効かない）。
 */
export default function TabsLayout() {
  const pinTabGate = usePinRegistrationGate();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} pinTabGate={pinTabGate} />}
    >
      <Tabs.Screen name="index" options={{ title: "ナビ" }} />
      <Tabs.Screen name="pins" options={{ title: "ピン" }} />
      <Tabs.Screen name="account" options={{ title: "アカウント" }} />
    </Tabs>
  );
}
