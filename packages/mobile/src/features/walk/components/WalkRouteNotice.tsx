import { ActivityIndicator, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import { isRetriableExploreError } from "@/features/walk/lib/exploreError";
import type { WalkRouteNoticeKind } from "@/features/walk/lib/walkRouteNotice";
import {
  walkRouteErrorMessage,
  walkRouteRecalcErrorMessage,
} from "@/features/walk/lib/walkRouteError";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkRouteNoticeProps = {
  kind: WalkRouteNoticeKind;
  /** kind === "base_error" のときの分類。 */
  baseErrorCode: ExploreErrorCode | null;
  /** kind === "recalc_failed" のときの分類。 */
  recalcErrorCode: ExploreErrorCode | null;
  onRetryBaseRoute: () => void;
  onRetryRecalculation: () => void;
  testID?: string;
};

/**
 * ルート系の通知（初期取得エラー / 再計算中 / 再計算失敗 / 再計算不可）の表示専用コンポーネント。
 * `WalkSaveStatus.tsx` と同じ構造・同じ a11y 方針（SS-35）。
 */
export function WalkRouteNotice({
  kind,
  baseErrorCode,
  recalcErrorCode,
  onRetryBaseRoute,
  onRetryRecalculation,
  testID = "walk-active-route-notice",
}: WalkRouteNoticeProps) {
  const theme = useTheme();
  const styles = useStyles();

  if (kind === "none") {
    return null;
  }

  if (kind === "recalculating") {
    return (
      <View testID={testID} style={[styles.container, styles.tintBox, styles.row]}>
        <ActivityIndicator color={theme.colors.textSecondary} />
        <Text style={styles.text} testID="walk-active-route-recalculating">
          現在地からルートを計算しています…
        </Text>
      </View>
    );
  }

  if (kind === "recalc_failed") {
    const message = walkRouteRecalcErrorMessage(recalcErrorCode ?? "unknown");
    const retriable = isRetriableExploreError(recalcErrorCode ?? "unknown");

    // 外側コンテナには accessibilityLabel/Role を付けない（`WalkSaveStatus.tsx` と同じ理由。
    // コンテナに付けるとプラットフォームによって1個の accessibility element として扱われ、
    // 内側の「再試行」ボタンがスクリーンリーダーから独立して操作できなくなるため）。
    return (
      <View testID={testID} style={[styles.container, styles.dangerBox]}>
        <View style={styles.row} accessibilityRole="alert" accessibilityLabel={message}>
          <Icon name="alert-circle" size={16} color={theme.colors.danger} />
          <Text style={styles.dangerText}>{message}</Text>
        </View>
        <Text style={styles.supplementText}>表示中のルートはそのままです。</Text>
        {retriable ? (
          <Button
            variant="secondary"
            size="sm"
            onPress={onRetryRecalculation}
            testID="walk-active-route-recalc-retry"
          >
            再試行
          </Button>
        ) : null}
      </View>
    );
  }

  if (kind === "base_error") {
    const message = walkRouteErrorMessage(baseErrorCode ?? "unknown");
    const retriable = isRetriableExploreError(baseErrorCode ?? "unknown");

    // a11y の構造は recalc_failed と揃える（エラー行だけを alert にし、ボタンはその外に置く）。
    // SS-16 の移植元はコンテナ直下に並べていて role が無かったが、同じコンポーネント内で
    // 分岐ごとにスクリーンリーダーの挙動が変わるのを避けるためこちらに合わせた。
    return (
      <View testID={testID} style={[styles.container, styles.dangerBox]}>
        <View style={styles.row} accessibilityRole="alert" accessibilityLabel={message}>
          <Icon name="alert-circle" size={16} color={theme.colors.danger} />
          <Text style={styles.dangerText}>{message}</Text>
        </View>
        {retriable ? (
          <Button
            variant="secondary"
            size="sm"
            onPress={onRetryBaseRoute}
            testID="walk-active-route-retry"
          >
            再試行
          </Button>
        ) : null}
      </View>
    );
  }

  // kind === "recalc_unavailable"
  return (
    <View testID={testID} style={[styles.container, styles.tintBox, styles.row]}>
      <Icon name="crosshair" size={16} color={theme.colors.textTertiary} />
      <Text style={styles.text} testID="walk-active-route-recalc-unavailable">
        現在地を取得できないため、ルートを更新できません。
      </Text>
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
  tintBox: {
    backgroundColor: theme.colors.surfaceTint,
  },
  dangerBox: {
    gap: theme.spacing[2],
    backgroundColor: theme.colors.dangerTint,
    alignItems: "flex-start",
  },
  text: {
    flex: 1,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textPrimary,
  },
  dangerText: {
    flex: 1,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textPrimary,
  },
  supplementText: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textSecondary,
  },
}));
