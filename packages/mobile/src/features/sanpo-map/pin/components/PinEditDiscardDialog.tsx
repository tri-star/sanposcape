import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { makeStyles } from "@/theme/makeStyles";

export type PinEditDiscardDialogProps = {
  open: boolean;
  /** 一部の変更が保存済み（保存の途中で失敗した）か。文言を「破棄」から「中止」に変える。 */
  partiallySaved: boolean;
  onCancel: () => void;
  onDiscard: () => void;
};

/**
 * PinEditDiscardDialog — 編集中の変更を破棄して画面を閉じてよいか確認する（SS-119）。
 * 登録用の `PinDiscardDialog` は「ピンはまだ保存されていません」という前提の文言なので流用しない。
 */
export function PinEditDiscardDialog({
  open,
  partiallySaved,
  onCancel,
  onDiscard,
}: PinEditDiscardDialogProps) {
  const styles = useStyles();

  return (
    <Dialog
      open={open}
      title={partiallySaved ? "保存を中止しますか？" : "変更を破棄しますか？"}
      onClose={onCancel}
      testID="pin-edit-discard-dialog"
      actions={
        <>
          <Button variant="secondary" fullWidth onPress={onCancel} testID="pin-edit-discard-cancel">
            編集を続ける
          </Button>
          <Button variant="danger" fullWidth onPress={onDiscard} testID="pin-edit-discard-confirm">
            {partiallySaved ? "中止する" : "破棄する"}
          </Button>
        </>
      }
    >
      <Text style={styles.body}>
        {partiallySaved
          ? "一部の変更は保存済みです。まだ保存されていない変更は破棄されます。"
          : "保存していない変更は失われます。"}
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
