import { ActivityIndicator, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import { isRetriableExploreError } from "@/features/walk/lib/exploreError";
import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import { estimateRoundTripMinutes, toOneWayMinutes } from "@/features/walk/lib/walkRoute";
import { walkRouteErrorMessage } from "@/features/walk/lib/walkRouteError";
import type { SpotCandidate, WalkRoute } from "@/features/walk/types";
import { toKilometers } from "@/lib/units";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkRouteSummaryProps = {
  /** 呼び出し側で null チェック済みのものを渡す。 */
  spot: SpotCandidate;
  walkRoute: WalkRoute | null;
  isLoading: boolean;
  errorCode: ExploreErrorCode | null;
  onRetry: () => void;
  testID?: string;
};

/**
 * WalkRouteSummary — 散歩開始画面の「目的地＋ルート」サマリ。
 * `WalkStartView` にインラインで書かれていた選択サマリを切り出したもの。
 * ready 状態でのみ `${testID}-ready` が存在する（E2E が「散歩を始める」を押せる状態を待つために使う）。
 */
export function WalkRouteSummary({
  spot,
  walkRoute,
  isLoading,
  errorCode,
  onRetry,
  testID = "walk-start-route-summary",
}: WalkRouteSummaryProps) {
  const theme = useTheme();
  const styles = useStyles();

  if (errorCode !== null) {
    return (
      <View style={styles.root} testID={testID}>
        <Icon name="alert-circle" size={18} color={theme.colors.danger} />
        <Text style={styles.errorText}>{walkRouteErrorMessage(errorCode)}</Text>
        {isRetriableExploreError(errorCode) ? (
          <Button variant="secondary" size="sm" onPress={onRetry} testID="walk-start-route-retry">
            再試行
          </Button>
        ) : null}
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.root} testID={testID}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.loadingText}>ルートを調べています…</Text>
      </View>
    );
  }

  if (walkRoute !== null) {
    return (
      <View style={styles.root} testID={testID}>
        <Icon name="flag" size={18} color={theme.colors.primary} />
        <View style={styles.text}>
          <Text style={styles.label}>目的地</Text>
          <Text style={styles.name}>{spot.name}</Text>
        </View>
        <View style={styles.timeColumn} testID={`${testID}-ready`}>
          <Text style={styles.time}>
            片道 {toOneWayMinutes(walkRoute.durationSeconds)}分・
            {toKilometers(walkRoute.distanceMeters)}km
          </Text>
          {/*
            「目安」の語を必ず残す: 同じ道を戻る前提の片道×2 の近似のため（実ルートは SS-33）。
            算出元にも注意: ここは /explore/routes/walking の実ルート片道値（walkRoute.durationSeconds）
            から計算しており、`SpotCard`（一覧）が表示する /explore/places 由来の
            `spot.roundTripMinutes` とは異なる API 呼び出し結果から来ている。そのため一覧時と
            選択後で「往復」の数値がわずかにズレ得るが、これはプランが明示的に選んだ設計であり
            バグではない（一覧は概算、選択後はより実測に近い値、という位置づけ）。
          */}
          <Text style={styles.timeSecondary}>
            往復の目安 {estimateRoundTripMinutes(walkRoute.durationSeconds)}分
          </Text>
        </View>
      </View>
    );
  }

  // walkRoute がまだ無い（未取得・エラー前の初期状態）ときは、探索結果由来の
  // `spot.roundTripMinutes`（/explore/places のスナップショット）を暫定表示する。
  return (
    <View style={styles.root} testID={testID}>
      <Icon name="flag" size={18} color={theme.colors.primary} />
      <View style={styles.text}>
        <Text style={styles.label}>目的地</Text>
        <Text style={styles.name}>{spot.name}</Text>
      </View>
      <Text style={styles.time}>往復 {spot.roundTripMinutes}分</Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3] - 2,
    padding: theme.spacing[3] + 2,
    backgroundColor: theme.colors.surfaceTint,
    borderRadius: theme.radius.md,
  },
  text: {
    flex: 1,
  },
  label: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textSecondary,
  },
  name: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  time: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  timeColumn: {
    alignItems: "flex-end",
  },
  timeSecondary: {
    marginTop: 2,
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textTertiary,
  },
  loadingText: {
    flex: 1,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  errorText: {
    flex: 1,
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
}));
