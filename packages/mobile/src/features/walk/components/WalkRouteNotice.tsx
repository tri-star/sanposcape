import { Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import { isRetriableExploreError } from "@/features/walk/lib/exploreError";
import { walkRouteErrorMessage } from "@/features/walk/lib/walkRouteError";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkRouteNoticeProps = {
  /** 周回ルートの初期取得エラー。null なら何も描画しない。 */
  errorCode: ExploreErrorCode | null;
  onRetry: () => void;
  testID?: string;
};

/**
 * 周回ルートの初期取得エラーの表示専用コンポーネント（SS-33 で再計算系の分岐を撤去）。
 * `useWalkRoute` は `keepPreviousData` を使わないため、エラー時は `walkRoute` が
 * `null` になる。「ルートが出ているのにエラーバナーも出る」状態は起きない。
 */
export function WalkRouteNotice({
  errorCode,
  onRetry,
  testID = "walk-active-route-notice",
}: WalkRouteNoticeProps) {
  const theme = useTheme();
  const styles = useStyles();

  if (errorCode === null) {
    return null;
  }

  const message = walkRouteErrorMessage(errorCode);
  const retriable = isRetriableExploreError(errorCode);

  // 外側コンテナには accessibilityLabel/Role を付けない（`WalkSaveStatus.tsx` と同じ理由。
  // コンテナに付けるとプラットフォームによって1個の accessibility element として扱われ、
  // 内側の「再試行」ボタンがスクリーンリーダーから独立して操作できなくなるため）。
  return (
    <View testID={testID} style={[styles.container, styles.dangerBox]}>
      <View style={styles.row} accessibilityRole="alert" accessibilityLabel={message}>
        <Icon name="alert-circle" size={16} color={theme.colors.danger} />
        <Text style={styles.dangerText}>{message}</Text>
      </View>
      {retriable ? (
        <Button variant="secondary" size="sm" onPress={onRetry} testID="walk-active-route-retry">
          再試行
        </Button>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  container: {
    marginHorizontal: theme.spacing[3],
    marginTop: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.radius.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  dangerBox: {
    gap: theme.spacing[2],
    backgroundColor: theme.colors.dangerTint,
    alignItems: "flex-start",
  },
  dangerText: {
    flex: 1,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textPrimary,
  },
}));
