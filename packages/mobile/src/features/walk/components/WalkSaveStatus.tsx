import { ActivityIndicator, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import type { WalkSaveErrorCode } from "@/features/walk/lib/walkSaveError";
import { isRetriableWalkSaveError, walkSaveErrorMessage } from "@/features/walk/lib/walkSaveError";
import type { WalkSaveStatus as WalkSaveStatusValue } from "@/features/walk/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkSaveStatusProps = {
  status: WalkSaveStatusValue;
  errorCode: WalkSaveErrorCode | null;
  onRetry: () => void;
  testID?: string;
};

/**
 * 散歩記録の保存状態の表示と再試行導線。View から条件分岐を追い出す表示専用コンポーネント。
 * `idle` のときは何も表示しない（ドラフトが無い＝画面カタログ等からの単独表示）。
 */
export function WalkSaveStatus({
  status,
  errorCode,
  onRetry,
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
        <Text style={styles.text}>記録を保存しています…</Text>
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
        <Icon name="check" size={18} color={theme.colors.primary} />
        <Text style={[styles.text, { color: theme.colors.primary }]}>記録を保存しました</Text>
      </View>
    );
  }

  const message = walkSaveErrorMessage(errorCode ?? "unknown");
  const retriable = isRetriableWalkSaveError(errorCode ?? "unknown");

  return (
    <View
      testID={testID}
      style={[styles.container, styles.errorBox]}
      accessibilityRole="alert"
      accessibilityLabel={message}
    >
      <View style={styles.row}>
        <Icon name="alert-circle" size={18} color={theme.colors.danger} />
        <Text style={styles.errorText}>{message}</Text>
      </View>
      {retriable ? (
        <Button variant="secondary" size="sm" onPress={onRetry} testID="walk-summary-save-retry">
          再試行
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
