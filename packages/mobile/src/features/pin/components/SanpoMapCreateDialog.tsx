import { useState } from "react";
import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { Input } from "@/components/ui/input/Input";
import { useSanpoMapCreate } from "@/features/pin/hooks/useSanpoMapCreate";
import { sanpoMapCreateErrorMessage } from "@/features/pin/lib/sanpoMapError";
import { sanpoMapNameErrorMessage, validateSanpoMapName } from "@/features/pin/lib/sanpoMapName";
import type { SanpoMap } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";

export type SanpoMapCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  /** 作成に成功した地図（キャッシュ反映は済んでいる）。閉じる操作は呼び出し側が行う。 */
  onCreated: (map: SanpoMap) => void;
  /** testID の接頭辞。既定 "sanpo-map-create"。 */
  testIDPrefix?: string;
};

/**
 * SanpoMapCreateDialog — 地図の新規作成ダイアログ（SS-121）。
 * 地図一覧の FAB と、SS-117 のピン登録画面の両方から使う前提で、画面を知らない作りにしている
 * （mobile ADR-014 D5）。
 *
 * 状態の初期化: 呼び出し側が開くたびに `key` を変えて作り直す。このコンポーネントは
 * 「マウント時が空」だけを保証する。作成中は閉じる操作をすべて止める（`dismissDisabled` と
 * `onClose` の両方）。作成ボタンは名前が空・長すぎるときは無効（自動再送はしない。冪等キーが無い）。
 */
export function SanpoMapCreateDialog({
  open,
  onClose,
  onCreated,
  testIDPrefix = "sanpo-map-create",
}: SanpoMapCreateDialogProps) {
  const styles = useStyles();
  const [name, setName] = useState("");
  const { create, isCreating, errorCode, reset } = useSanpoMapCreate({ onCreated });

  const validation = validateSanpoMapName(name);
  const nameError = validation.ok ? null : sanpoMapNameErrorMessage(validation.reason);
  const createError = errorCode !== null ? sanpoMapCreateErrorMessage(errorCode) : null;

  const handleChangeName = (next: string) => {
    setName(next);
    // 入力を変えたら前回の作成エラーは消す。
    if (errorCode !== null) reset();
  };

  const handleSubmit = () => {
    if (!validation.ok || isCreating) return;
    create(validation.name);
  };

  const handleClose = () => {
    if (isCreating) return;
    onClose();
  };

  return (
    <Dialog
      open={open}
      title="地図を作成"
      onClose={handleClose}
      dismissDisabled={isCreating}
      testID={`${testIDPrefix}-dialog`}
      actions={
        <>
          <Button
            variant="ghost"
            fullWidth
            disabled={isCreating}
            onPress={handleClose}
            testID={`${testIDPrefix}-cancel`}
          >
            キャンセル
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={!validation.ok || isCreating}
            onPress={handleSubmit}
            testID={`${testIDPrefix}-submit`}
          >
            {isCreating ? "作成中…" : "作成"}
          </Button>
        </>
      }
    >
      <Input
        label="地図の名前"
        placeholder="例: 近所のパン屋さん"
        value={name}
        onChangeText={handleChangeName}
        error={nameError ?? undefined}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        disabled={isCreating}
        testID={`${testIDPrefix}-name-input`}
      />
      {createError !== null ? (
        // 失敗は非同期に出るので、スクリーンリーダーへ通知する（AccountDeleteDialog と同じ）。
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.error}
          testID={`${testIDPrefix}-error`}
        >
          {createError}
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
