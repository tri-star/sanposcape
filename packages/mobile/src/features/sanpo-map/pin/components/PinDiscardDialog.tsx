import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { makeStyles } from "@/theme/makeStyles";

export type PinDiscardDialogProps = {
  open: boolean;
  /** ピンが既に作成済み（写真の送信途中で離脱しようとしている）か。 */
  pinAlreadySaved: boolean;
  onCancel: () => void;
  onDiscard: () => void;
};

/**
 * PinDiscardDialog — 入力を破棄して画面を閉じてよいか確認する。
 * ピンが既に保存済み（M-R3）の場合は文言を変える（「破棄」ではなく「中止」）。
 */
export function PinDiscardDialog({
  open,
  pinAlreadySaved,
  onCancel,
  onDiscard,
}: PinDiscardDialogProps) {
  const styles = useStyles();

  return (
    <Dialog
      open={open}
      title={pinAlreadySaved ? "写真の保存を中止しますか？" : "入力内容を破棄しますか？"}
      onClose={onCancel}
      testID="pin-discard-dialog"
      actions={
        <>
          <Button variant="secondary" fullWidth onPress={onCancel}>
            編集を続ける
          </Button>
          <Button variant="danger" fullWidth onPress={onDiscard} testID="pin-discard-confirm">
            {pinAlreadySaved ? "中止する" : "破棄する"}
          </Button>
        </>
      }
    >
      <Text style={styles.body}>
        {pinAlreadySaved
          ? "ピンは保存済みです。保存できなかった写真は破棄されます。"
          : "このピンはまだ保存されていません。"}
      </Text>
    </Dialog>
  );
}

const useStyles = makeStyles((theme) => ({
  body: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
}));
