import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import {
  ACCOUNT_DELETE_CANCEL_LABEL,
  ACCOUNT_DELETE_CLOSE_LABEL,
  ACCOUNT_DELETE_DIALOG_DESCRIPTION,
  ACCOUNT_DELETE_DIALOG_TITLE,
  accountDeleteConfirmLabel,
} from "@/features/settings/lib/accountDeleteCopy";
import type { AccountDeleteErrorCode } from "@/features/settings/lib/accountDeleteError";
import {
  accountDeleteErrorMessage,
  canRetryAccountDelete,
} from "@/features/settings/lib/accountDeleteError";
import { isAccountDeleteBusy, type AccountDeleteStatus } from "@/features/settings/types";
import { makeStyles } from "@/theme/makeStyles";

export type AccountDeleteDialogProps = {
  open: boolean;
  status: AccountDeleteStatus;
  errorCode: AccountDeleteErrorCode | null;
  onCancel: () => void;
  onConfirm: () => void;
  testID?: string;
};

/**
 * アカウント削除の確認ダイアログ。確認・実行中・失敗をまとめる。
 * 手本は `src/features/history/components/WalkDeleteDialog.tsx`（SS-60）。構造をほぼそのまま
 * 踏襲する。
 *
 * 再試行可能な失敗（通信・サーバー・不明）では、同じ「削除する」ボタンがそのまま再試行になる
 * （ラベルを変えない・ボタンを増やさない）。
 *
 * 一方、再試行しても結果が変わらない失敗（401 = サインインし直しが必要）では削除ボタンを
 * 出さない。押しても同じ失敗を繰り返すだけで、ユーザーに「あと1回押せば消えるかもしれない」と
 * 誤解させるため（`canRetryAccountDelete` 参照）。
 *
 * `isBusy`（`isAccountDeleteBusy`）は `"deleting"` に加えて `"deleted"`（削除成功後）も
 * 操作不可扱いにする。成功後の後始末（`authService.signOut()` → `AuthGate` の退避）は複数
 * レンダーを挟む非同期チェーンのため、"deleted" を busy から外すと成功直後の一瞬だけボタンが
 * 再度押せる状態に戻ってしまう（SS-62 ローカルレビュー A-1。詳細は `isAccountDeleteBusy` 参照）。
 */
export function AccountDeleteDialog({
  open,
  status,
  errorCode,
  onCancel,
  onConfirm,
  testID,
}: AccountDeleteDialogProps) {
  const styles = useStyles();
  const isBusy = isAccountDeleteBusy(status);
  const canRetry = canRetryAccountDelete(errorCode);

  return (
    <Dialog
      open={open}
      title={ACCOUNT_DELETE_DIALOG_TITLE}
      onClose={onCancel}
      dismissDisabled={isBusy}
      testID={testID ?? "account-delete-dialog"}
      actions={
        <>
          <Button
            variant="secondary"
            fullWidth
            disabled={isBusy}
            onPress={onCancel}
            testID="account-delete-cancel"
          >
            {canRetry ? ACCOUNT_DELETE_CANCEL_LABEL : ACCOUNT_DELETE_CLOSE_LABEL}
          </Button>
          {canRetry ? (
            <Button
              variant="danger"
              fullWidth
              disabled={isBusy}
              onPress={onConfirm}
              testID="account-delete-confirm"
            >
              {accountDeleteConfirmLabel(isBusy)}
            </Button>
          ) : null}
        </>
      }
    >
      <Text style={styles.body}>{ACCOUNT_DELETE_DIALOG_DESCRIPTION}</Text>
      {errorCode !== null ? (
        // 失敗は mutation 完了後に動的に出るため、スクリーンリーダーへ通知する（PR #81 Copilot
        // レビュー指摘）。iOS は accessibilityRole="alert"、Android は accessibilityLiveRegion で拾う。
        <Text
          style={styles.error}
          testID="account-delete-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {accountDeleteErrorMessage(errorCode)}
        </Text>
      ) : null}
    </Dialog>
  );
}

const useStyles = makeStyles((theme) => ({
  body: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
  },
  error: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.danger,
  },
}));
