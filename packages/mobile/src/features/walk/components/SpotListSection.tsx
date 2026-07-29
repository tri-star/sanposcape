import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { SpotCard } from "@/features/walk/components/SpotCard";
import { CATEGORY_META } from "@/features/walk/data/categories";
import {
  type ExploreErrorCode,
  exploreErrorMessage,
  isRetriableExploreError,
} from "@/features/walk/lib/exploreError";
import type { SpotCandidate } from "@/features/walk/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SpotListSectionProps = {
  candidates: readonly SpotCandidate[];
  selectedSpotId: string | null;
  onSelectSpot: (id: string) => void;
  isLoading: boolean;
  isRefetching: boolean;
  errorCode: ExploreErrorCode | null;
  onRetry: () => void;
  testID?: string;
};

/**
 * SpotListSection — 候補リストと loading/empty/error の状態表示をまとめたセクション。
 * 表示優先順位: エラー > 初回ローディング > 空 > 一覧（§5.21）。
 */
export function SpotListSection({
  candidates,
  selectedSpotId,
  onSelectSpot,
  isLoading,
  isRefetching,
  errorCode,
  onRetry,
  testID,
}: SpotListSectionProps) {
  const theme = useTheme();
  const styles = useStyles();

  if (errorCode !== null) {
    return (
      <Card style={styles.stateCard} testID="spot-list-error">
        <Icon name="alert-circle" size={22} color={theme.colors.danger} />
        <Text style={styles.stateText}>{exploreErrorMessage(errorCode)}</Text>
        {isRetriableExploreError(errorCode) ? (
          <Button variant="secondary" onPress={onRetry} testID="spot-list-retry">
            再試行
          </Button>
        ) : null}
      </Card>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.stateCard} testID="spot-list-loading">
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.stateText}>まわりのスポットを探しています…</Text>
      </View>
    );
  }

  if (candidates.length === 0) {
    return (
      <Card style={styles.stateCard} testID="spot-list-empty">
        <Icon name="search-x" size={22} color={theme.colors.textTertiary} />
        <Text style={styles.stateText}>この条件で行けるスポットが見つかりませんでした</Text>
        <Text style={styles.stateSubtext}>
          往復の時間を延ばすか、表示するスポットの種類を増やしてみてください
        </Text>
      </Card>
    );
  }

  return (
    <View testID={testID}>
      <View style={styles.header}>
        <Text style={styles.title}>歩いて行けるスポット</Text>
        <Text style={styles.count}>
          <Text style={styles.countValue}>{candidates.length}</Text> 件
          {isRefetching ? <Text style={styles.updating}> ・更新中</Text> : null}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {candidates.map((spot, index) => (
          <SpotCard
            key={spot.id}
            spot={spot}
            meta={CATEGORY_META[spot.category]}
            selected={spot.id === selectedSpotId}
            onPress={() => onSelectSpot(spot.id)}
            testID={`spot-card-${index}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  stateCard: {
    alignItems: "center",
    gap: theme.spacing[2],
    marginHorizontal: theme.layout.pageGutter,
    marginTop: theme.spacing[4],
    padding: theme.spacing[5],
  },
  stateText: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
    textAlign: "center",
  },
  stateSubtext: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: theme.layout.pageGutter + 4,
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  title: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  count: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  countValue: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.primary,
  },
  updating: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textTertiary,
  },
  list: {
    gap: theme.spacing[2] + 2,
    paddingHorizontal: theme.layout.pageGutter - 2,
    paddingVertical: theme.spacing[1],
  },
}));
