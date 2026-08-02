import { useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { HistoryStateCard } from "@/features/history/components/HistoryStateCard";
import { WalkHistoryCard } from "@/features/history/components/WalkHistoryCard";
import { useWalkHistory } from "@/features/history/hooks/useWalkHistory";
import {
  isRetriableWalkHistoryError,
  walkHistoryErrorMessage,
} from "@/features/history/lib/walkHistoryError";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type RecentWalksSectionProps = {
  testID?: string;
};

/** 記録タブに表示する件数の上限。 */
const RECENT_WALKS_COUNT = 3;

/**
 * RecentWalksSection — 記録タブに置く「最近の散歩」セクション。
 * `/walk-history` と同じ queryKey（`useWalkHistory`）を共有するため、「すべて見る」で
 * 一覧へ遷移しても追加のネットワーク呼び出しは発生しない。
 */
export function RecentWalksSection({ testID }: RecentWalksSectionProps) {
  const theme = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const history = useWalkHistory();
  const items = history.items.slice(0, RECENT_WALKS_COUNT);

  const renderBody = () => {
    if (history.errorCode !== null) {
      return (
        <HistoryStateCard
          testID="recent-walks-error"
          icon="alert-circle"
          tone="danger"
          title={walkHistoryErrorMessage(history.errorCode)}
          action={
            isRetriableWalkHistoryError(history.errorCode)
              ? { label: "再試行", onPress: history.reload }
              : undefined
          }
        />
      );
    }

    if (history.isLoading) {
      return (
        <View style={styles.loading} testID="recent-walks-loading">
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      );
    }

    if (items.length === 0) {
      return (
        <HistoryStateCard
          testID="recent-walks-empty"
          icon="footprints"
          title="まだ散歩の記録がありません"
          description="散歩を終えると、ここに記録が並びます。"
        />
      );
    }

    return (
      <View style={styles.list}>
        {items.map((item, index) => (
          <WalkHistoryCard
            key={item.id}
            item={item}
            testID={`recent-walk-${index}`}
            onPress={() =>
              router.push({ pathname: "/walk-history/[walkId]", params: { walkId: item.id } })
            }
          />
        ))}
      </View>
    );
  };

  // 0件かつエラー無しのときは「すべて見る」を出さない（空状態の説明と重複するため）。
  const showSeeAll = items.length > 0 || history.errorCode !== null;

  return (
    <View testID={testID ?? "recent-walks-section"} style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>最近の散歩</Text>
        {showSeeAll ? (
          <Button
            variant="ghost"
            size="sm"
            icon="chevron-right"
            iconPosition="right"
            onPress={() => router.push("/walk-history")}
            testID="history-see-all-walks"
          >
            すべて見る
          </Button>
        ) : null}
      </View>
      {renderBody()}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    gap: theme.spacing[2] + 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  list: {
    gap: theme.spacing[2] + 2,
  },
  loading: {
    alignItems: "center",
    paddingVertical: theme.spacing[4],
  },
}));
