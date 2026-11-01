import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import {
  SANPO_MAP_MEMBER_CANCEL_LABEL,
  SANPO_MAP_MEMBER_CLOSE_LABEL,
  canRetrySanpoMapMemberRemove,
  sanpoMapMemberRemoveDialogCopy,
  sanpoMapMemberRemoveErrorMessage,
  type SanpoMapMemberRemoveErrorCode,
} from "@/features/pin/lib/sanpoMapMember";
import { makeStyles } from "@/theme/makeStyles";

export type SanpoMapMemberRemoveDialogProps = {
  open: boolean;
  mode: "leave" | "remove";
  sanpoMapName: string;
  memberName: string;
  busy: boolean;
  errorCode: SanpoMapMemberRemoveErrorCode | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * 地図から抜ける・メンバーを外す確認ダイアログ（SS-249。`PinDeleteDialog` と同じ構成）。
 * 確認・実行中・失敗をまとめる。再試行しても変わらない失敗では実行ボタンを出さない。
 */
export function SanpoMapMemberRemoveDialog({
  open,
  mode,
  sanpoMapName,
  memberName,
  busy,
  errorCode,
  onCancel,
  onConfirm,
}: SanpoMapMemberRemoveDialogProps) {
  const styles = useStyles();
  const copy = sanpoMapMemberRemoveDialogCopy({ mode, sanpoMapName, memberName });
  const canRetry = canRetrySanpoMapMemberRemove(errorCode);

  return (
    <Dialog
      open={open}
      title={copy.title}
      onClose={onCancel}
      dismissDisabled={busy}
      testID="sanpo-map-member-remove-dialog"
      actions={
        <>
          <Button
            variant="secondary"
            fullWidth
            disabled={busy}
            onPress={onCancel}
            testID="sanpo-map-member-remove-cancel"
          >
            {canRetry ? SANPO_MAP_MEMBER_CANCEL_LABEL : SANPO_MAP_MEMBER_CLOSE_LABEL}
          </Button>
          {canRetry ? (
            <Button
              variant="danger"
              fullWidth
              disabled={busy}
              onPress={onConfirm}
              testID="sanpo-map-member-remove-confirm"
            >
              {busy ? copy.busyLabel : copy.confirmLabel}
            </Button>
          ) : null}
        </>
      }
    >
      <Text style={styles.body}>{copy.description}</Text>
      {errorCode !== null ? (
        <Text
          style={styles.error}
          testID="sanpo-map-member-remove-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {sanpoMapMemberRemoveErrorMessage(errorCode)}
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
