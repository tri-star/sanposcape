import { resolveSettingsDialogBack } from "@/features/settings/lib/settingsDialogBack";
import type { AccountDeleteStatus } from "@/features/settings/types";
import { isAccountDeleteBusy } from "@/features/settings/types";
import type { UseScreenBackResult } from "@/hooks/useScreenBack";
import { useScreenBack } from "@/hooks/useScreenBack";

export type UseSettingsBackOptions = {
  logoutDialogOpen: boolean;
  isSigningOut: boolean;
  accountDeleteDialogOpen: boolean;
  accountDeleteStatus: AccountDeleteStatus;
  closeLogoutDialog: () => void;
  closeAccountDeleteDialog: () => void;
};

/**
 * 設定画面の「戻る」（画面上の戻るボタン・Android のシステムバック・ライセンスへの遷移のラッチ）。SS-46。
 *
 * スタックに戻り先が無い（例: コールドスタートのディープリンクで開いた）ときは、設定の入口のアカウントタブへ戻る。
 * ログアウト・アカウント削除のダイアログを開いている間は、画面ごと戻らずダイアログだけを閉じる（ログアウト中・削除中は閉じず、戻る操作だけを消費する）。
 * 判定は `resolveSettingsDialogBack`（純粋関数・テスト対象）。
 *
 * `useScreenBack`（`react-native` を値 import する）を使うため Vitest の対象にしない。
 */
export function useSettingsBack({
  logoutDialogOpen,
  isSigningOut,
  accountDeleteDialogOpen,
  accountDeleteStatus,
  closeLogoutDialog,
  closeAccountDeleteDialog,
}: UseSettingsBackOptions): UseScreenBackResult {
  return useScreenBack({
    fallbackHref: "/(tabs)/account",
    onIntercept: () => {
      const action = resolveSettingsDialogBack({
        logoutDialogOpen,
        isSigningOut,
        accountDeleteDialogOpen,
        accountDeleteBusy: isAccountDeleteBusy(accountDeleteStatus),
      });
      // switch + never で、アクションが増えたときに既存の分岐へ黙って吸い込まれないようにする。
      switch (action) {
        case "none":
          return false;
        case "close-logout":
          closeLogoutDialog();
          return true;
        case "close-account-delete":
          closeAccountDeleteDialog();
          return true;
        case "consume":
          return true;
        default: {
          const exhaustiveCheck: never = action;
          return exhaustiveCheck;
        }
      }
    },
  });
}
