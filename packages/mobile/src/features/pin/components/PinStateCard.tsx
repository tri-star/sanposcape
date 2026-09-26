import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Icon, type IconName } from "@/components/ui/icon/Icon";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type PinStateCardProps = {
  icon: IconName;
  title: string;
  description?: string;
  /** 既定 neutral。danger は icon 色を theme.colors.danger にする。 */
  tone?: "neutral" | "danger";
  action?: { label: string; onPress: () => void; testID?: string };
  testID?: string;
};

/**
 * PinStateCard — ピンの地図・詳細で共通化する空・エラー状態の表示（SS-118）。
 * `features/history/components/HistoryStateCard.tsx` と同じ Props・見た目だが、feature 間
 * import を避けるため pin 側に独立して持つ（`docs/architecture-guideline.md`）。
 * 2機能で使うことになったら `src/components/` への昇格を検討する（今は「同じ見た目の別物」
 * として扱う）。
 */
export function PinStateCard({
  icon,
  title,
  description,
  tone = "neutral",
  action,
  testID,
}: PinStateCardProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <Card style={styles.root} testID={testID}>
      <Icon
        name={icon}
        size={22}
        color={tone === "danger" ? theme.colors.danger : theme.colors.textTertiary}
      />
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {action ? (
        <Button variant="secondary" onPress={action.onPress} testID={action.testID}>
          {action.label}
        </Button>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    alignItems: "center",
    gap: theme.spacing[2],
  },
  title: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
    textAlign: "center",
  },
  description: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
}));
