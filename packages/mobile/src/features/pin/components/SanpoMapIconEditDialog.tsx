import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { SanpoMapIconPicker } from "@/features/pin/components/SanpoMapIconPicker";
import { useSanpoMapIconUpdate } from "@/features/pin/hooks/useSanpoMapIconUpdate";
import { sanpoMapUpdateErrorMessage } from "@/features/pin/lib/sanpoMapError";
import type { SanpoMapIconKey } from "@/features/pin/types";
import type { SanpoMap } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";

export type SanpoMapIconEditDialogProps = {
  open: boolean;
  sanpoMapId: string;
  /** 開いた時点のアイコン（初期選択。呼び出し側が開くたびに key を変えて作り直す）。 */
  currentIcon: SanpoMapIconKey;
  onClose: () => void;
  /** 変更に成功した地図（キャッシュ反映は済んでいる）。閉じる操作は呼び出し側が行う。 */
  onUpdated: (map: SanpoMap) => void;
  /** 変更中かどうかの通知（呼び出し側の useScreenBack の onIntercept が使う）。 */
  onBusyChange?: (busy: boolean) => void;
  /** 既定 "sanpo-map-icon-edit"。 */
  testIDPrefix?: string;
};

/**
 * SanpoMapIconEditDialog — 地図詳細から開くアイコン変更ダイアログ（SS-171）。
 * 構成は `SanpoMapCreateDialog` に揃える。変更中は閉じる操作をすべて止める。
 */
export function SanpoMapIconEditDialog({
  open,
  sanpoMapId,
  currentIcon,
  onClose,
  onUpdated,
  onBusyChange,
  testIDPrefix = "sanpo-map-icon-edit",
}: SanpoMapIconEditDialogProps) {
  const styles = useStyles();
  const [selected, setSelected] = useState<SanpoMapIconKey>(currentIcon);
  const { update, isUpdating, errorCode, reset } = useSanpoMapIconUpdate({ onUpdated });

  useEffect(() => {
    onBusyChange?.(isUpdating);
  }, [isUpdating, onBusyChange]);

  // 変更中にアンマウントされても、呼び出し側の busy が true のまま残らないようにする。
  const onBusyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  }, [onBusyChange]);
  useEffect(() => {
    return () => onBusyChangeRef.current?.(false);
  }, []);

  const updateError = errorCode !== null ? sanpoMapUpdateErrorMessage(errorCode) : null;

  const handleChangeIcon = (next: SanpoMapIconKey) => {
    setSelected(next);
    // 選び直したら前回のエラーは消す。
    if (errorCode !== null) reset();
  };

  const handleSubmit = () => {
    if (selected === currentIcon || isUpdating) return;
    update({ sanpoMapId, icon: selected });
  };

  const handleClose = () => {
    if (isUpdating) return;
    onClose();
  };

  return (
    <Dialog
      open={open}
      title="アイコンを変更"
      onClose={handleClose}
      dismissDisabled={isUpdating}
      testID={`${testIDPrefix}-dialog`}
      actions={
        <>
          <Button
            variant="ghost"
            fullWidth
            disabled={isUpdating}
            onPress={handleClose}
            testID={`${testIDPrefix}-cancel`}
          >
            キャンセル
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={selected === currentIcon || isUpdating}
            onPress={handleSubmit}
            testID={`${testIDPrefix}-submit`}
          >
            {isUpdating ? "変更中…" : "変更する"}
          </Button>
        </>
      }
    >
      <SanpoMapIconPicker
        value={selected}
        onChange={handleChangeIcon}
        disabled={isUpdating}
        testIDPrefix={testIDPrefix}
      />
      {updateError !== null ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.error}
          testID={`${testIDPrefix}-error`}
        >
          {updateError}
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
