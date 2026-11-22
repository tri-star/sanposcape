import { Text } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkIdleNoticeProps = {
  onStart: () => void;
  testID?: string;
};

/**
 * WalkIdleNotice — 進行中の散歩が無い状態でナビタブを開いたときの表示。
 * 実地図・実トラッキングになると、ダミーの目的地で偽の散歩中画面を出すことは成立しないため、
 * 「散歩を始める」導線に差し替える。
 */
export function WalkIdleNotice({ onStart, testID = "walk-active-idle" }: WalkIdleNoticeProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <Card style={styles.root} testID={testID}>
      <Icon name="footprints" size={28} color={theme.colors.textTertiary} />
      <Text style={styles.title}>まだ散歩を始めていません</Text>
      <Text style={styles.body}>
        「散歩開始」からスポットを選ぶと、ここに地図・経過時間・歩行距離が表示されます。
      </Text>
      <Button
        variant="primary"
        icon="footprints"
        fullWidth
        onPress={onStart}
        testID="walk-active-start-cta"
      >
        散歩を始める
      </Button>
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    margin: theme.layout.pageGutter,
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[6],
  },
  title: {
    fontSize: theme.typography.size.lg,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  body: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
}));
