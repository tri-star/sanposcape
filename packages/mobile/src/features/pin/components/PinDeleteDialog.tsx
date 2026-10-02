import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import {
  PIN_DELETE_CANCEL_LABEL,
  PIN_DELETE_CLOSE_LABEL,
  PIN_DELETE_DIALOG_DESCRIPTION,
  PIN_DELETE_DIALOG_TITLE,
  canRetryPinDelete,
  pinDeleteConfirmLabel,
  pinDeleteErrorMessage,
  type PinDeleteErrorCode,
} from "@/features/pin/lib/pinDeleteError";
import type { PinDeleteStatus } from "@/features/pin/lib/pinDetailState";
import { makeStyles } from "@/theme/makeStyles";

export type PinDeleteDialogProps = {
  open: boolean;
  status: PinDeleteStatus;
  errorCode: PinDeleteErrorCode | null;
  onCancel: () => void;
  onConfirm: () => void;
  testID?: string;
};

/**
 * ピン削除の確認ダイアログ（`WalkDeleteDialog` と同じ構成）。確認・実行中・失敗をまとめる。
 *
 * 再試行できる失敗（通信・サーバー・不明）では、同じ「削除する」ボタンがそのまま再試行になる。
 * 2回目の DELETE は 404 になるが `deletePin()` が成功として扱うため、常に安全な再試行になる。
 * 再試行しても変わらない失敗（401/403/422）では削除ボタンを出さず、「閉じる」だけにする。
 */
export function PinDeleteDialog({
  open,
  status,
  errorCode,
  onCancel,
  onConfirm,
  testID,
}: PinDeleteDialogProps) {
  const styles = useStyles();
  const isDeleting = status === "deleting";
  const canRetry = canRetryPinDelete(errorCode);

  return (
    <Dialog
      open={open}
      title={PIN_DELETE_DIALOG_TITLE}
      onClose={onCancel}
      dismissDisabled={isDeleting}
      testID={testID ?? "pin-delete-dialog"}
      actions={
        <>
          <Button
            variant="secondary"
            fullWidth
            disabled={isDeleting}
            onPress={onCancel}
            testID="pin-delete-cancel"
          >
            {canRetry ? PIN_DELETE_CANCEL_LABEL : PIN_DELETE_CLOSE_LABEL}
          </Button>
          {canRetry ? (
            <Button
              variant="danger"
              fullWidth
              disabled={isDeleting}
              onPress={onConfirm}
              testID="pin-delete-confirm"
            >
              {pinDeleteConfirmLabel(isDeleting)}
            </Button>
          ) : null}
        </>
      }
    >
      <Text style={styles.body}>{PIN_DELETE_DIALOG_DESCRIPTION}</Text>
      {errorCode !== null ? (
        // 失敗は mutation 完了後に動的に出るため、スクリーンリーダーへ通知する。
        <Text
          style={styles.error}
          testID="pin-delete-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {pinDeleteErrorMessage(errorCode)}
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
