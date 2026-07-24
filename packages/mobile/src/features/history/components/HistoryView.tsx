import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/card/Card";
import { PeriodChart } from "@/features/history/components/PeriodChart";
import { StepGoalCard } from "@/features/history/components/StepGoalCard";
import { STEP_GOAL, STREAK_DAYS, TODAY_STEPS } from "@/features/history/data/records";
import { buildPeriodChart } from "@/features/history/lib/periodChart";
import type { Period } from "@/features/history/types";
import { makeStyles } from "@/theme/makeStyles";

/**
 * 履歴（記録）画面。mock `isRecord` を1:1で再現する。
 */
export function HistoryView() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>("week");
  const chart = buildPeriodChart(period);

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
          <Text style={styles.subtitle}>田中さん、今日も歩きましょう</Text>
        </View>

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
              <Text style={styles.cardValue}>{STREAK_DAYS}</Text>
              <Text style={styles.cardUnit}>日連続</Text>
            </View>
          </Card>
        </View>

        <StepGoalCard todaySteps={TODAY_STEPS} goal={STEP_GOAL} />
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
