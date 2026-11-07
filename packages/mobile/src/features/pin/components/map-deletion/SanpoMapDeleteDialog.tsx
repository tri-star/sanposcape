import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import {
  SANPO_MAP_DELETE_CANCEL_LABEL,
  SANPO_MAP_DELETE_CLOSE_LABEL,
  SANPO_MAP_DELETE_DIALOG_TITLE,
  canRetrySanpoMapDelete,
  sanpoMapDeleteConfirmLabel,
  sanpoMapDeleteErrorMessage,
  type SanpoMapDeleteErrorCode,
  type SanpoMapDeleteStatus,
} from "@/features/pin/lib/map-deletion/sanpoMapDelete";
import { makeStyles } from "@/theme/makeStyles";

export type SanpoMapDeleteDialogProps = {
  open: boolean;
  status: SanpoMapDeleteStatus;
  errorCode: SanpoMapDeleteErrorCode | null;
  /** 何が消えるかの説明（`sanpoMapDeleteDescription` の段落）。 */
  description: readonly string[];
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * 地図の削除の確認ダイアログ（SS-265。`PinDeleteDialog` と同じ構成）。確認・実行中・失敗をまとめる。
 *
 * 再試行できる失敗（通信・サーバー・不明）では、同じ「削除する」ボタンがそのまま再試行になる
 * （2回目の DELETE は 404 になるが `deleteSanpoMap()` が成功として扱う）。
 * 再試行しても変わらない失敗（401/403/422）では削除ボタンを出さず、「閉じる」だけにする。
 */
export function SanpoMapDeleteDialog({
  open,
  status,
  errorCode,
  description,
  onCancel,
  onConfirm,
}: SanpoMapDeleteDialogProps) {
  const styles = useStyles();
  const isDeleting = status === "deleting";
  const canRetry = canRetrySanpoMapDelete(errorCode);

  return (
    <Dialog
      open={open}
      title={SANPO_MAP_DELETE_DIALOG_TITLE}
      onClose={onCancel}
      dismissDisabled={isDeleting}
      testID="sanpo-map-delete-dialog"
      actions={
        <>
          <Button
            variant="secondary"
            fullWidth
            disabled={isDeleting}
            onPress={onCancel}
            testID="sanpo-map-delete-cancel"
          >
            {canRetry ? SANPO_MAP_DELETE_CANCEL_LABEL : SANPO_MAP_DELETE_CLOSE_LABEL}
          </Button>
          {canRetry ? (
            <Button
              variant="danger"
              fullWidth
              disabled={isDeleting}
              onPress={onConfirm}
              testID="sanpo-map-delete-confirm"
            >
              {sanpoMapDeleteConfirmLabel(isDeleting)}
            </Button>
          ) : null}
        </>
      }
    >
      {description.map((paragraph) => (
        <Text key={paragraph} style={styles.body}>
          {paragraph}
        </Text>
      ))}
      {errorCode !== null ? (
        // 失敗は mutation 完了後に動的に出るため、スクリーンリーダーへ通知する。
        <Text
          style={styles.error}
          testID="sanpo-map-delete-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {sanpoMapDeleteErrorMessage(errorCode)}
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
