import { TabBar } from "@/components/ui/tab-bar/TabBar";
import { APP_TAB_ITEMS, resolveActiveAppTab } from "@/features/navigation/lib/appTabs";
import { useTheme } from "@/theme/useTheme";

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
 * デザイン: mock の TAB BAR（ナビ / ピン / アカウント。SS-145）。
 */
export function AppTabBar({ state, navigation, insets }: AppTabBarProps) {
  const theme = useTheme();
  const currentRouteName = resolveActiveAppTab(state.routes[state.index]?.name);

  return (
    <TabBar
      items={APP_TAB_ITEMS}
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
