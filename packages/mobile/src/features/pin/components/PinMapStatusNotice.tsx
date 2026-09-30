import { ActivityIndicator, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import type { PinMapNotice } from "@/features/pin/lib/pinMapNotice";
import { pinReadErrorMessage } from "@/features/pin/lib/pinReadError";
import { makeStyles } from "@/theme/makeStyles";

export type PinMapStatusNoticeProps = {
  notice: PinMapNotice;
  onSignIn: () => void;
  onRetry: () => void;
  /**
   * testID の接頭辞。`${p}-sign-in` / `${p}-sign-in-button` / `${p}-pins-loading` / `${p}-pins-error` /
   * `${p}-pins-retry` / `${p}-pins-truncated` / `${p}-pins-empty` を付ける。
   */
  testIDPrefix: string;
};

/**
 * PinMapStatusNotice — 登録済みピンの取得状態の案内（SS-146 で `PinMapView` から切り出し）。
 * `/pins/map` の下部カードとピンタブの情報カードで共有する。
 */
export function PinMapStatusNotice({
  notice,
  onSignIn,
  onRetry,
  testIDPrefix: p,
}: PinMapStatusNoticeProps) {
  const styles = useStyles();

  switch (notice.kind) {
    case "sign-in":
      return (
        <View style={styles.row} testID={`${p}-sign-in`}>
          <Text style={styles.text}>サインインすると、登録したピンが地図に表示されます</Text>
          <Button variant="primary" size="sm" onPress={onSignIn} testID={`${p}-sign-in-button`}>
            サインイン
          </Button>
        </View>
      );
    case "loading":
      return (
        <View style={styles.row} testID={`${p}-pins-loading`}>
          <ActivityIndicator />
          <Text style={styles.text}>ピンを読み込んでいます…</Text>
        </View>
      );
    case "error":
      return (
        <View style={styles.row} testID={`${p}-pins-error`}>
          <Text style={styles.text}>{pinReadErrorMessage(notice.code)}</Text>
          {notice.retriable ? (
            <Button variant="secondary" size="sm" onPress={onRetry} testID={`${p}-pins-retry`}>
              再試行
            </Button>
          ) : null}
        </View>
      );
    case "truncated":
      return (
        <Text style={styles.textSecondary} testID={`${p}-pins-truncated`}>
          ピンが多いため、新しいものから一部だけを表示しています。地図を拡大すると、ほかのピンも表示されます
        </Text>
      );
    case "empty":
      return (
        <Text style={styles.text} testID={`${p}-pins-empty`}>
          この範囲に登録したピンはありません
        </Text>
      );
    case "none":
      return null;
    default: {
      const exhaustiveCheck: never = notice;
      return exhaustiveCheck;
    }
  }
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  text: {
    flex: 1,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  textSecondary: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
}));
