import { ActivityIndicator, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import type { WalkSaveErrorCode } from "@/features/walk/lib/walkSaveError";
import { walkSaveErrorAction, walkSaveErrorMessage } from "@/features/walk/lib/walkSaveError";
import type { WalkSaveStatus as WalkSaveStatusValue } from "@/features/walk/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkSaveStatusProps = {
  status: WalkSaveStatusValue;
  errorCode: WalkSaveErrorCode | null;
  onRetry: () => void;
  /** unauthorized のときに出すサインイン CTA の押下ハンドラ（SS-37）。 */
  onSignIn: () => void;
  testID?: string;
};

/**
 * 散歩記録の保存状態の表示と再試行導線。View から条件分岐を追い出す表示専用コンポーネント。
 * `idle` のときは何も表示しない（ドラフトが無い＝画面カタログ等からの単独表示）。
 * 状態の判別が必要な E2E のために、saving/saved は内側の Text に `${testID}-saving` /
 * `${testID}-saved` を持つ。error 状態は `walk-summary-save-retry` / `walk-summary-save-sign-in`
 * のいずれかで判別できる（`unauthorized` は後者）。
 */
export function WalkSaveStatus({
  status,
  errorCode,
  onRetry,
  onSignIn,
  testID = "walk-summary-save-status",
}: WalkSaveStatusProps) {
  const theme = useTheme();
  const styles = useStyles();

  if (status === "idle") {
    return null;
  }

  if (status === "saving") {
    return (
      <View
        testID={testID}
        style={[styles.container, styles.row]}
        accessibilityRole="text"
        accessibilityLabel="記録を保存しています"
      >
        <ActivityIndicator color={theme.colors.textSecondary} />
        <Text style={styles.text} testID={`${testID}-saving`}>
          記録を保存しています…
        </Text>
      </View>
    );
  }

  if (status === "saved") {
    return (
      <View
        testID={testID}
        style={[styles.container, styles.row]}
        accessibilityRole="text"
        accessibilityLabel="記録を保存しました"
      >
        <Icon name="check" size={18} color={theme.colors.success} />
        <Text style={[styles.text, { color: theme.colors.success }]} testID={`${testID}-saved`}>
          記録を保存しました
        </Text>
      </View>
    );
  }

  const message = walkSaveErrorMessage(errorCode ?? "unknown");
  const action = walkSaveErrorAction(errorCode ?? "unknown");

  // 外側コンテナには accessibilityLabel/Role を付けない（`WalkActiveView` の
  // `routeNotice` / `LocationPermissionNotice` と同じ方針）。コンテナに付けると
  // プラットフォームによって1個の accessibility element として扱われ、
  // 内側の「再試行」ボタンがスクリーンリーダーから独立して操作できなくなるため、
  // アラートの読み上げ対象はメッセージ行だけに絞る。
  return (
    <View testID={testID} style={[styles.container, styles.errorBox]}>
      <View style={styles.row} accessibilityRole="alert" accessibilityLabel={message}>
        <Icon name="alert-circle" size={18} color={theme.colors.danger} />
        <Text style={styles.errorText}>{message}</Text>
      </View>
      {action === "retry" ? (
        <Button variant="secondary" size="sm" onPress={onRetry} testID="walk-summary-save-retry">
          再試行
        </Button>
      ) : null}
      {action === "sign_in" ? (
        <Button variant="primary" size="sm" onPress={onSignIn} testID="walk-summary-save-sign-in">
          サインインして保存
        </Button>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  container: {
    marginTop: theme.spacing[4],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
  },
  text: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  errorBox: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    backgroundColor: theme.colors.dangerTint,
    borderRadius: theme.radius.md,
    alignItems: "flex-start",
  },
  errorText: {
    flex: 1,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textPrimary,
  },
}));
