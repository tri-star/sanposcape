import { TabBar, type TabBarItem } from "@/components/ui/tab-bar/TabBar";
import { useTheme } from "@/theme/useTheme";

const TAB_ITEMS: readonly TabBarItem[] = [
  { label: "ナビ", value: "index", icon: "footprints" },
  { label: "検索", value: "search", icon: "search" },
  { label: "記録", value: "history", icon: "bar-chart-2" },
];

/**
 * Expo Router の `Tabs` `tabBar` prop（`BottomTabBarProps`）から
 * このアダプタが実際に使うフィールドだけを抜き出した最小限の型。
 * 内部パッケージ（`expo-router/build/react-navigation/bottom-tabs`）への
 * 直接依存を避けるため、構造的に一致する最小限の型を自前で定義する。
 */
export type AppTabBarProps = {
  state: {
    index: number;
    routes: readonly { key: string; name: string }[];
  };
  navigation: {
    navigate: (name: string) => void;
  };
  insets: {
    bottom: number;
  };
};

/**
 * AppTabBar — Expo Router `Tabs` の `tabBar` prop から既存 `TabBar` プリミティブへのアダプタ。
 * デザイン: mock の TAB BAR（ナビ / 検索 / 記録）。
 */
export function AppTabBar({ state, navigation, insets }: AppTabBarProps) {
  const theme = useTheme();
  const currentRouteName = state.routes[state.index]?.name ?? TAB_ITEMS[0]!.value;

  return (
    <TabBar
      items={TAB_ITEMS}
      value={currentRouteName}
      onChange={(value) => navigation.navigate(value)}
      testID="app-tab-bar"
      itemTestIDPrefix="app-tab"
      style={{
        height: theme.layout.tabBarHeight + insets.bottom,
        paddingBottom: insets.bottom,
      }}
    />
  );
}
