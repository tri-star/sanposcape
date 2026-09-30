import { TabActionBar } from "@/components/layout/TabActionBar";
import { Button } from "@/components/ui/button/Button";
import {
  ACCOUNT_ACTION_BAR_TEST_ID,
  resolveAccountActions,
  type AccountActionHref,
} from "@/features/account/lib/accountActions";

export type AccountActionBarProps = {
  /** ルートが isDevToolsEnabled() を渡す（feature 側は実行時の判定を知らない）。 */
  showScreenCatalog: boolean;
  /** 遷移は呼び出し側（ルート）が useNavigateOnce のラッチ越しに行う。 */
  onNavigate: (href: AccountActionHref) => void;
};

/**
 * アカウントタブの下部（タブバーの上）の帯。「設定」と、本番以外では「画面カタログ」を並べる（SS-148）。
 * 見た目はピンタブの「地図一覧」ボタンに揃える。`useRouter` は使わない（遷移はルートが持つ）。
 */
export function AccountActionBar({ showScreenCatalog, onNavigate }: AccountActionBarProps) {
  return (
    <TabActionBar testID={ACCOUNT_ACTION_BAR_TEST_ID}>
      {resolveAccountActions({ showScreenCatalog }).map((action) => (
        <Button
          key={action.key}
          variant="secondary"
          size="sm"
          icon={action.icon}
          onPress={() => onNavigate(action.href)}
          testID={action.testID}
        >
          {action.label}
        </Button>
      ))}
    </TabActionBar>
  );
}
