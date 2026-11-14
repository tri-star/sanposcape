import { Tabs } from "expo-router";

import { AppTabBar } from "@/features/navigation/components/AppTabBar";

/**
 * タブナビゲーション（ナビ / ピン / アカウント。SS-145）。
 * ログイン直後の着地点はピンタブ（`features/auth/lib/landingHref.ts`）。
 */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <AppTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: "ナビ" }} />
      <Tabs.Screen name="pins" options={{ title: "ピン" }} />
      <Tabs.Screen name="account" options={{ title: "アカウント" }} />
    </Tabs>
  );
}
