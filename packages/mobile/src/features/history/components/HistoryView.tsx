import type { ReactNode } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/card/Card";
import { HistoryStateCard } from "@/features/history/components/HistoryStateCard";
import { PeriodChart } from "@/features/history/components/PeriodChart";
import { RecentWalksSection } from "@/features/history/components/RecentWalksSection";
import { StepGoalCard } from "@/features/history/components/StepGoalCard";
import { useHistorySummary } from "@/features/history/hooks/useHistorySummary";
import {
  HISTORY_SIGN_IN_DESCRIPTION,
  HISTORY_SIGN_IN_TITLE,
  resolveHistoryStatsState,
} from "@/features/history/lib/historyStatsState";
import {
  isRetriableWalkStatsError,
  walkStatsErrorMessage,
} from "@/features/history/lib/walkStatsError";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type HistoryViewProps = {
  /** サインイン中ユーザーの表示名。未サインイン/復元中は null。 */
  displayName: string | null;
  /** サインイン中か。ルート（app/(tabs)/account.tsx）が注入する（features/history は認証を読まない。ADR-009 決定8）。 */
  isSignedIn: boolean;
  /** ゲスト向けサインイン案内のボタン。 */
  onSignIn: () => void;
  /**
   * スクロール領域の下（タブバーの上）に固定で置く要素。アカウントタブの `AccountActionBar` をルートが渡す
   * （render slot。feature 間の import を作らない）。
   */
  footer?: ReactNode;
};

/**
 * 履歴（記録）画面。mock `isRecord` を1:1で再現する。
 * 集計（`GET /walks/stats`）のローディング/エラーは集計セクションだけに閉じ、
 * 「最近の散歩」（別クエリの `RecentWalksSection`）は常に独立して表示する
 * （集計 API が落ちても履歴一覧は見られるようにするため）。
 * ゲストには集計・「最近の散歩」を出さず、サインイン案内を出す（通信しない。SS-148）。
 */
export function HistoryView({ displayName, isSignedIn, onSignIn, footer }: HistoryViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const {
    greeting,
    period,
    setPeriod,
    chart,
    streakDays,
    todaySteps,
    stepGoal,
    isLoading,
    errorCode,
    reload,
  } = useHistorySummary({ displayName, enabled: isSignedIn });

  const statsState = resolveHistoryStatsState({ isSignedIn, errorCode, isLoading });

  const renderStats = () => {
    switch (statsState) {
      case "sign-in-required":
        return (
          <HistoryStateCard
            testID="history-sign-in-required"
            icon="user"
            title={HISTORY_SIGN_IN_TITLE}
            description={HISTORY_SIGN_IN_DESCRIPTION}
            action={{ label: "サインイン", onPress: onSignIn, testID: "history-sign-in" }}
          />
        );
      case "error":
        return (
          <HistoryStateCard
            testID="history-stats-error"
            icon="alert-circle"
            tone="danger"
            title={walkStatsErrorMessage(errorCode ?? "unknown")}
            action={
              errorCode !== null && isRetriableWalkStatsError(errorCode)
                ? { label: "再試行", onPress: reload }
                : undefined
            }
          />
        );
      case "loading":
        return (
          <View style={styles.loading} testID="history-stats-loading">
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        );
      case "ready":
        break;
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
          { paddingTop: insets.top + 44, paddingBottom: theme.spacing[6] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>歩いた記録</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {greeting}
          </Text>
        </View>

        {renderStats()}

        {isSignedIn ? <RecentWalksSection /> : null}
      </ScrollView>
      {footer}
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
