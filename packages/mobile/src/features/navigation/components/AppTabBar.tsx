import { TabBar } from "@/components/ui/tab-bar/TabBar";
import { resolveActiveAppTab, resolveVisibleAppTabs } from "@/features/navigation/lib/appTabs";
import type { FeatureGateDecision } from "@/lib/featureGate";
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
  /** pin_registration の判定。"disabled"（OFF 確定）のときだけピンタブを隠す。 */
  pinTabGate: FeatureGateDecision;
};

/**
 * AppTabBar — Expo Router `Tabs` の `tabBar` prop から既存 `TabBar` プリミティブへのアダプタ。
 * デザイン: mock の TAB BAR（ナビ / ピン / アカウント。SS-145）。ピンタブは pin_registration の OFF 確定時に隠す。
 * `Tabs.Screen` の `href: null` はこの独自タブバーには効かないため、表示するタブは `resolveVisibleAppTabs` で決める。
 */
export function AppTabBar({ state, navigation, insets, pinTabGate }: AppTabBarProps) {
  const theme = useTheme();
  const items = resolveVisibleAppTabs({ pinTabGate });
  const currentRouteName = resolveActiveAppTab(state.routes[state.index]?.name);

  return (
    <TabBar
      items={items}
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
