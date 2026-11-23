import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { formatClock } from "@/lib/formatClock";
import { makeStyles } from "@/theme/makeStyles";

export type WalkEndDialogProps = {
  open: boolean;
  elapsedSec: number;
  distanceMeters: number;
  /** 「続ける」・システムバック。ダイアログを閉じるだけ（散歩は終わらない）。 */
  onClose: () => void;
  /** 「終了して記録」。 */
  onConfirm: () => void;
};

/**
 * 散歩を終える確認のダイアログ（`WalkActiveView`）。
 *
 * 表示中の Android のシステムバックは `Dialog`（RN の `Modal`）の `onRequestClose` → `onClose` だけに届き、
 * ダイアログを閉じるだけになる（「続ける」と同じ。散歩は終わらず、タブの戻る・アプリの終了も起きない。SS-46）。
 * タブのルートなので `useScreenBack` は使わない（タブの `backBehavior` を奪うため）。
 */
export function WalkEndDialog({
  open,
  elapsedSec,
  distanceMeters,
  onClose,
  onConfirm,
}: WalkEndDialogProps) {
  const styles = useStyles();
  return (
    <Dialog
      open={open}
      title="散歩を終了しますか？"
      onClose={onClose}
      testID="walk-end-dialog"
      actions={
        <>
          <Button variant="secondary" fullWidth onPress={onClose}>
            続ける
          </Button>
          <Button variant="primary" fullWidth onPress={onConfirm} testID="walk-end-confirm">
            終了して記録
          </Button>
        </>
      }
    >
      <Text style={styles.dialogBody}>
        経過時間 {formatClock(elapsedSec)}・約{(distanceMeters / 1000).toFixed(1)}
        km を今日の記録に保存します。
      </Text>
    </Dialog>
  );
}

const useStyles = makeStyles((theme) => ({
  dialogBody: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
    lineHeight: 24,
  },
}));
