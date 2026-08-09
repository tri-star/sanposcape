import { Text, View } from "react-native";

import { Card } from "@/components/ui/card/Card";
import { ProgressBar } from "@/components/ui/progress-bar/ProgressBar";
import { ESTIMATED_STEPS_LABEL, ESTIMATED_STEPS_NOTE } from "@/features/history/lib/stepEstimate";
import { makeStyles } from "@/theme/makeStyles";

export type StepGoalCardProps = {
  todaySteps: number;
  goal: number;
};

/**
 * StepGoalCard — 「今日の推定歩数」プログレス表示。
 * デザイン: mock `isRecord` の目標歩数カード。
 * 歩数は距離から歩幅0.7m換算の推定値のため、見出し（推定）＋注記（換算の根拠）の2段で
 * 実測値と誤認されない表示にする（`stepEstimate.ts` に文言を集約し Vitest で検証する）。
 */
export function StepGoalCard({ todaySteps, goal }: StepGoalCardProps) {
  const styles = useStyles();

  return (
    <Card testID="history-step-goal-card">
      <View style={styles.row}>
        <Text style={styles.label}>{ESTIMATED_STEPS_LABEL}</Text>
        <Text style={styles.value}>
          <Text style={styles.valueStrong}>{todaySteps.toLocaleString()}</Text> /{" "}
          {goal.toLocaleString()}歩
        </Text>
      </View>
      <ProgressBar value={todaySteps} max={goal} tone="primary" />
      <Text style={styles.note} testID="history-step-estimate-note">
        {ESTIMATED_STEPS_NOTE}
      </Text>
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: theme.spacing[2],
  },
  label: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  value: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  valueStrong: {
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  note: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },
}));
