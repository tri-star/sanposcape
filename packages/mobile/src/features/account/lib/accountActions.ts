import type { IconName } from "@/components/ui/icon/Icon";

export type AccountActionHref = "/settings" | "/dev-screens";

export type AccountAction = {
  key: "settings" | "screen-catalog";
  label: string;
  icon: IconName;
  href: AccountActionHref;
  testID: string;
};

export const ACCOUNT_ACTION_BAR_TEST_ID = "account-action-bar";

const SETTINGS_ACTION: AccountAction = {
  key: "settings",
  label: "設定",
  icon: "settings-2",
  href: "/settings",
  testID: "account-open-settings",
};

const SCREEN_CATALOG_ACTION: AccountAction = {
  key: "screen-catalog",
  label: "画面カタログ",
  icon: "book-open",
  href: "/dev-screens",
  testID: "account-open-screen-catalog",
};

/**
 * アカウントタブの下部に出すボタンの一覧。並び順は「設定」→「画面カタログ」。
 * 画面カタログは `showScreenCatalog` のときだけ（本番以外のビルド。判定は呼び出し側 = ルートが持つ）。
 * 認証状態では出し分けない: ゲストにも「設定」を出し（設定画面がサインイン導線を出す）、
 * 画面カタログも公開ルートなので認証状態を問わない。
 */
export function resolveAccountActions(input: {
  showScreenCatalog: boolean;
}): readonly AccountAction[] {
  return input.showScreenCatalog ? [SETTINGS_ACTION, SCREEN_CATALOG_ACTION] : [SETTINGS_ACTION];
}
