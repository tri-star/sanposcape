import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import type { WalkDeleteErrorCode } from "@/features/history/lib/walkDeleteError";
import { canRetryWalkDelete, walkDeleteErrorMessage } from "@/features/history/lib/walkDeleteError";
import {
  WALK_DELETE_CANCEL_LABEL,
  WALK_DELETE_CLOSE_LABEL,
  WALK_DELETE_DIALOG_DESCRIPTION,
  WALK_DELETE_DIALOG_TITLE,
  walkDeleteConfirmLabel,
} from "@/features/history/lib/walkDeleteCopy";
import type { WalkDeleteStatus } from "@/features/history/lib/walkDetailBodyState";
import { makeStyles } from "@/theme/makeStyles";

export type WalkDeleteDialogProps = {
  open: boolean;
  status: WalkDeleteStatus;
  errorCode: WalkDeleteErrorCode | null;
  onCancel: () => void;
  onConfirm: () => void;
  testID?: string;
};

/**
 * 散歩削除の確認ダイアログ。確認・実行中・失敗をまとめる（受け入れ条件2・3）。
 * `SettingsView` のログアウトダイアログが手本。
 *
 * 再試行可能な失敗（通信・サーバー・不明）では、同じ「削除する」ボタンがそのまま再試行になる
 * （ラベルを変えない・ボタンを増やさない）。2回目の DELETE は 404 になるが `deleteWalk()` が
 * それを成功として扱うため、常に安全な再試行になる。
 *
 * 一方、再試行しても結果が変わらない失敗（401 = サインインし直しが必要 /
 * 422 = リクエストが不正）では削除ボタンを出さない。押しても同じ失敗を繰り返すだけで、
 * ユーザーに「あと1回押せば消えるかもしれない」と誤解させるため
 * （`HistoryStateCard` 側で `isRetriableWalkHistoryError` によって再試行導線を出し分けているのと同じ判断）。
 */
export function WalkDeleteDialog({
  open,
  status,
  errorCode,
  onCancel,
  onConfirm,
  testID,
}: WalkDeleteDialogProps) {
  const styles = useStyles();
  const isDeleting = status === "deleting";
  const canRetry = canRetryWalkDelete(errorCode);

  return (
    <Dialog
      open={open}
      title={WALK_DELETE_DIALOG_TITLE}
      onClose={onCancel}
      dismissDisabled={isDeleting}
      testID={testID ?? "walk-delete-dialog"}
      actions={
        <>
          <Button
            variant="secondary"
            fullWidth
            disabled={isDeleting}
            onPress={onCancel}
            testID="walk-delete-cancel"
          >
            {canRetry ? WALK_DELETE_CANCEL_LABEL : WALK_DELETE_CLOSE_LABEL}
          </Button>
          {canRetry ? (
            <Button
              variant="danger"
              fullWidth
              disabled={isDeleting}
              onPress={onConfirm}
              testID="walk-delete-confirm"
            >
              {walkDeleteConfirmLabel(isDeleting)}
            </Button>
          ) : null}
        </>
      }
    >
      <Text style={styles.body}>{WALK_DELETE_DIALOG_DESCRIPTION}</Text>
      {errorCode !== null ? (
        <Text style={styles.error} testID="walk-delete-error">
          {walkDeleteErrorMessage(errorCode)}
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
