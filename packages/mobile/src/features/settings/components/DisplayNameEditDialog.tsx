import { useState } from "react";
import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { Input } from "@/components/ui/input/Input";
import { useDisplayNameUpdate } from "@/features/settings/hooks/useDisplayNameUpdate";
import {
  displayNameErrorMessage,
  displayNameUpdateErrorMessage,
  validateDisplayName,
} from "@/features/settings/lib/displayName";
import { makeStyles } from "@/theme/makeStyles";

export type DisplayNameEditDialogProps = {
  open: boolean;
  /** 入力欄の初期値（いまの表示名。未設定は null で空欄）。 */
  initialDisplayName: string | null;
  onClose: () => void;
};

/**
 * 表示名の変更ダイアログ（SS-268）。作りは `SanpoMapCreateDialog` と同じ。
 *
 * 状態の初期化: 呼び出し側が開くたびに `key` を変えて作り直す（このコンポーネントは
 * 「マウント時が初期値」だけを保証する）。保存中は閉じる操作をすべて止める。
 * 保存ボタンは、名前が空・長すぎる・使えない文字を含む・いまの名前と同じときは無効。
 * 成功したら閉じる（新しい名前は認証セッション経由で設定画面のカードに出る）。
 */
export function DisplayNameEditDialog({
  open,
  initialDisplayName,
  onClose,
}: DisplayNameEditDialogProps) {
  const styles = useStyles();
  const [value, setValue] = useState(initialDisplayName ?? "");
  const { save, isSaving, errorCode, reset } = useDisplayNameUpdate({ onSaved: onClose });

  const validation = validateDisplayName(value);
  const inputError = validation.ok ? null : displayNameErrorMessage(validation.reason);
  const unchanged = validation.ok && validation.displayName === initialDisplayName;
  const saveError = errorCode !== null ? displayNameUpdateErrorMessage(errorCode) : null;
  const canSave = validation.ok && !unchanged && !isSaving;

  const handleChange = (next: string) => {
    setValue(next);
    // 入力を変えたら前回の保存の失敗は消す。
    if (errorCode !== null) reset();
  };

  const handleSubmit = () => {
    if (!validation.ok || !canSave) return;
    save(validation.displayName);
  };

  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  return (
    <Dialog
      open={open}
      title="表示名を変更"
      onClose={handleClose}
      dismissDisabled={isSaving}
      testID="settings-display-name-dialog"
      actions={
        <>
          <Button
            variant="ghost"
            fullWidth
            disabled={isSaving}
            onPress={handleClose}
            testID="settings-display-name-cancel"
          >
            キャンセル
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={!canSave}
            onPress={handleSubmit}
            testID="settings-display-name-submit"
          >
            {isSaving ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <Input
        label="表示名"
        placeholder="例: さんぽ好き"
        value={value}
        onChangeText={handleChange}
        error={inputError ?? undefined}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        autoCorrect={false}
        disabled={isSaving}
        testID="settings-display-name-input"
      />
      {saveError !== null ? (
        // 失敗は非同期に出るので、スクリーンリーダーへ通知する（AccountDeleteDialog と同じ）。
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.error}
          testID="settings-display-name-error"
        >
          {saveError}
        </Text>
      ) : null}
    </Dialog>
  );
}

const useStyles = makeStyles((theme) => ({
  error: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.danger,
  },
}));
