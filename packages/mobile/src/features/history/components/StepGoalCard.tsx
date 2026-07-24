import { Text, View } from "react-native";

import { Card } from "@/components/ui/card/Card";
import { ProgressBar } from "@/components/ui/progress-bar/ProgressBar";
import { makeStyles } from "@/theme/makeStyles";

export type StepGoalCardProps = {
  todaySteps: number;
  goal: number;
};

/**
 * StepGoalCard — 「今日の目標歩数」プログレス表示。
 * デザイン: mock `isRecord` の目標歩数カード。
 */
export function StepGoalCard({ todaySteps, goal }: StepGoalCardProps) {
  const styles = useStyles();

  return (
    <Card testID="history-step-goal-card">
      <View style={styles.row}>
        <Text style={styles.label}>今日の目標歩数</Text>
        <Text style={styles.value}>
          <Text style={styles.valueStrong}>{todaySteps.toLocaleString()}</Text> /{" "}
          {goal.toLocaleString()}歩
        </Text>
      </View>
      <ProgressBar value={todaySteps} max={goal} tone="primary" />
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
}));
