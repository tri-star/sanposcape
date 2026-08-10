import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/card/Card";
import { HistoryStateCard } from "@/features/history/components/HistoryStateCard";
import { PeriodChart } from "@/features/history/components/PeriodChart";
import { RecentWalksSection } from "@/features/history/components/RecentWalksSection";
import { StepGoalCard } from "@/features/history/components/StepGoalCard";
import { useHistorySummary } from "@/features/history/hooks/useHistorySummary";
import {
  isRetriableWalkStatsError,
  walkStatsErrorMessage,
} from "@/features/history/lib/walkStatsError";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/**
 * 履歴（記録）画面。mock `isRecord` を1:1で再現する。
 * 集計（`GET /walks/stats`）のローディング/エラーは集計セクションだけに閉じ、
 * 「最近の散歩」（別クエリの `RecentWalksSection`）は常に独立して表示する
 * （集計 API が落ちても履歴一覧は見られるようにするため）。
 */
export function HistoryView() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const {
    userName,
    period,
    setPeriod,
    chart,
    streakDays,
    todaySteps,
    stepGoal,
    isLoading,
    errorCode,
    reload,
  } = useHistorySummary();

  const renderStats = () => {
    if (errorCode !== null) {
      return (
        <HistoryStateCard
          testID="history-stats-error"
          icon="alert-circle"
          tone="danger"
          title={walkStatsErrorMessage(errorCode)}
          action={
            isRetriableWalkStatsError(errorCode) ? { label: "再試行", onPress: reload } : undefined
          }
        />
      );
    }

    if (isLoading) {
      return (
        <View style={styles.loading} testID="history-stats-loading">
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      );
    }

    return (
      <>
        <PeriodChart period={period} onChangePeriod={setPeriod} chart={chart} />

        <View style={styles.row}>
          <Card style={styles.halfCard}>
            <Text style={styles.cardLabel}>合計距離</Text>
            <View style={styles.cardValueRow}>
              <Text style={styles.cardValue}>{chart.totalDistKm.toFixed(1)}</Text>
              <Text style={styles.cardUnit}>km</Text>
            </View>
          </Card>
          <Card style={styles.halfCard}>
            <Text style={styles.cardLabel}>連続日数</Text>
            <View style={styles.cardValueRow}>
              <Text style={styles.cardValue}>{streakDays}</Text>
              <Text style={styles.cardUnit}>日連続</Text>
            </View>
          </Card>
        </View>

        <StepGoalCard todaySteps={todaySteps} goal={stepGoal} />
      </>
    );
  };

  return (
    <View testID="history-screen" style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 44, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>歩いた記録</Text>
          <Text style={styles.subtitle}>{`${userName}、今日も歩きましょう`}</Text>
        </View>

        {renderStats()}

        <RecentWalksSection />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
  content: {
    paddingHorizontal: theme.layout.pageGutter,
    gap: theme.spacing[4],
  },
  header: {
    marginBottom: theme.spacing[1],
  },
  title: {
    fontSize: theme.typography.size["2xl"],
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  loading: {
    alignItems: "center",
    paddingVertical: theme.spacing[4],
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing[2] + 2,
  },
  halfCard: {
    flex: 1,
  },
  cardLabel: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  cardValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  cardValue: {
    fontSize: theme.typography.size["2xl"],
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  cardUnit: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
}));
