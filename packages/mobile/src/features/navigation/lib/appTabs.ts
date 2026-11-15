import type { TabBarItem } from "@/components/ui/tab-bar/TabBar";

/** `app/(tabs)/` のルート名（= Tabs.Screen の name = testID `app-tab-<value>` の接尾辞）。 */
export type AppTabRouteName = "index" | "pins" | "account";

/** 表示順（ナビ / ピン / アカウント。SS-145）。 */
export const APP_TAB_ITEMS: readonly TabBarItem<AppTabRouteName>[] = [
  { label: "ナビ", value: "index", icon: "navigation" },
  { label: "ピン", value: "pins", icon: "map-pin" },
  { label: "アカウント", value: "account", icon: "user" },
];

function isAppTabRouteName(name: string | undefined): name is AppTabRouteName {
  return APP_TAB_ITEMS.some((item) => item.value === name);
}

/** フォーカス中のルート名からアクティブなタブを決める。タブ以外の名前・undefined は "index"。 */
export function resolveActiveAppTab(routeName: string | undefined): AppTabRouteName {
  return isAppTabRouteName(routeName) ? routeName : "index";
}
