import { Tabs } from "expo-router";

import { AppTabBar } from "@/features/navigation/components/AppTabBar";

/**
 * タブナビゲーション（ナビ / 検索 / 記録）。
 * 標準タブバーの代わりに既存 `TabBar` プリミティブを `AppTabBar` でブリッジして使う。
 */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <AppTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: "ナビ" }} />
      <Tabs.Screen name="search" options={{ title: "検索" }} />
      <Tabs.Screen name="history" options={{ title: "記録" }} />
    </Tabs>
  );
}
