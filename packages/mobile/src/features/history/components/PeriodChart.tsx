import { Text, View } from "react-native";

import { Card } from "@/components/ui/card/Card";
import { Tabs } from "@/components/ui/tabs/Tabs";
import type { PeriodChartResult } from "@/features/history/lib/periodChart";
import type { Period } from "@/features/history/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

const PERIOD_ITEMS = [
  { label: "1週間", value: "week" },
  { label: "1ヶ月", value: "month" },
] as const;

export type PeriodChartProps = {
  period: Period;
  onChangePeriod: (period: Period) => void;
  /**
   * `buildPeriodChart(period)` の算出済み結果。呼び出し側（`HistoryView`）と二重計算にならないよう、
   * ここでは受け取るだけで再計算しない（単一情報源化）。
   */
  chart: PeriodChartResult;
};

/**
 * PeriodChart — 期間タブ＋合計ウォーキング時間＋棒グラフ。
 * デザイン: mock `isRecord` の期間タブ＋グラフカード。
 */
export function PeriodChart({ period, onChangePeriod, chart }: PeriodChartProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.root}>
      <Tabs
        items={PERIOD_ITEMS}
        value={period}
        onChange={onChangePeriod}
        testID="history-period-tabs"
      />

      <Card testID="history-period-chart">
        <Text style={styles.cardLabel}>合計ウォーキング時間</Text>
        <Text style={styles.totalValue}>{chart.totalWalkLabel}</Text>
        <View style={styles.barRow}>
          {chart.bars.map((bar) => {
            const barColor = bar.highlight
              ? theme.colors.primary
              : bar.value === 0
                ? theme.colors.trackStrong
                : theme.palette.blue300;
            const labelColor = bar.highlight ? theme.colors.primary : theme.colors.textTertiary;
            return (
              <View key={bar.label} style={styles.barColumn}>
                <Text style={styles.barValue}>{bar.value}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[styles.bar, { height: `${bar.heightPct}%`, backgroundColor: barColor }]}
                  />
                </View>
                <Text
                  style={[
                    styles.barLabel,
                    {
                      color: labelColor,
                      fontWeight: bar.highlight
                        ? theme.typography.weight.bold
                        : theme.typography.weight.medium,
                    },
                  ]}
                >
                  {bar.label}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    gap: theme.spacing[4],
  },
  cardLabel: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  totalValue: {
    fontSize: theme.typography.size["3xl"] + 4,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[5],
  },
  barRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    height: 150,
  },
  barColumn: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  barValue: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textTertiary,
  },
  barTrack: {
    width: "100%",
    maxWidth: 26,
    flex: 1,
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderRadius: theme.radius.xs + 2,
    minHeight: 3,
  },
  barLabel: {
    fontSize: theme.typography.size["2xs"] + 1,
  },
}));
