import { useState } from "react";
import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { Input } from "@/components/ui/input/Input";
import { parseInvitationLink } from "@/features/pin/lib/invitation";
import { makeStyles } from "@/theme/makeStyles";

export type InvitationLinkPasteDialogProps = {
  open: boolean;
  onClose: () => void;
  /** 読み取れたトークン（受諾画面へ進む）。 */
  onOpen: (token: string) => void;
};

/**
 * 地図一覧の「招待リンクで参加」（SS-250）。届いた招待リンクを貼り付けて受諾画面へ進む。
 * Universal Links / App Links が効かない環境（開発ビルド・リンクの検証に失敗した Android・
 * アプリ内ブラウザ）の逃げ道。読み取れないときは通信せずに案内を出す。
 */
export function InvitationLinkPasteDialog({
  open,
  onClose,
  onOpen,
}: InvitationLinkPasteDialogProps) {
  const styles = useStyles();
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);

  const close = () => {
    setText("");
    setInvalid(false);
    onClose();
  };
  const submit = () => {
    const token = parseInvitationLink(text);
    if (token === null) {
      setInvalid(true);
      return;
    }
    setText("");
    setInvalid(false);
    onOpen(token);
  };

  return (
    <Dialog
      open={open}
      title="招待リンクで参加"
      onClose={close}
      testID="invitation-link-paste-dialog"
      actions={
        <>
          <Button variant="secondary" fullWidth onPress={close} testID="invitation-link-cancel">
            キャンセル
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={text.trim() === ""}
            onPress={submit}
            testID="invitation-link-open"
          >
            開く
          </Button>
        </>
      }
    >
      <Text style={styles.body}>届いた招待リンクを貼り付けてください。</Text>
      <Input
        value={text}
        onChangeText={(value) => {
          setText(value);
          setInvalid(false);
        }}
        placeholder="https://sanposcape.com/i/#…"
        accessibilityLabel="招待リンク"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={submit}
        error={
          invalid
            ? "招待リンクとして読み取れませんでした。届いたリンクをそのまま貼り付けてください。"
            : undefined
        }
        testID="invitation-link-input"
      />
    </Dialog>
  );
}

const useStyles = makeStyles((theme) => ({
  body: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
  },
}));
