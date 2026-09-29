import type { TabBarItem } from "@/components/ui/tab-bar/TabBar";
import type { FeatureGateDecision } from "@/lib/featureGate";

/** `app/(tabs)/` のルート名（= Tabs.Screen の name = testID `app-tab-<value>` の接尾辞）。 */
export type AppTabRouteName = "index" | "pins" | "account";

/** 表示順（ナビ / ピン / アカウント。SS-145）。 */
export const APP_TAB_ITEMS: readonly TabBarItem<AppTabRouteName>[] = [
  { label: "ナビ", value: "index", icon: "navigation" },
  { label: "ピン", value: "pins", icon: "map-pin" },
  { label: "アカウント", value: "account", icon: "user" },
];

/**
 * タブバーに出すタブ。ピンタブは pin_registration の判定が "disabled"（OFF 確定）のときだけ除く。
 * "pending"（取得中）は出したままにする（ON なのにタブが消えてまた出るのを避ける）。
 */
export function resolveVisibleAppTabs(input: {
  pinTabGate: FeatureGateDecision;
}): readonly TabBarItem<AppTabRouteName>[] {
  if (input.pinTabGate === "disabled") {
    return APP_TAB_ITEMS.filter((item) => item.value !== "pins");
  }
  return APP_TAB_ITEMS;
}

function isAppTabRouteName(name: string | undefined): name is AppTabRouteName {
  return APP_TAB_ITEMS.some((item) => item.value === name);
}

/**
 * フォーカス中のルート名からアクティブなタブを決める。タブ以外の名前・undefined は "index"。
 * ピンタブが隠れていても "pins" はそのまま返す（リダイレクトまでの一瞬どのタブもハイライトされないだけ）。
 */
export function resolveActiveAppTab(routeName: string | undefined): AppTabRouteName {
  return isAppTabRouteName(routeName) ? routeName : "index";
}
