import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { StatBlock } from "@/components/ui/stat-block/StatBlock";
import { formatClock } from "@/lib/formatClock";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/**
 * 散歩終了サマリ画面。mock に直接該当なし。
 * `isMain` の終了導線＋`isRecord` の StatBlock/Card トーンで補完する。
 * 経過時間・距離・歩数は散歩中画面から router params で受け取る（静的実装）。
 */
export function WalkSummaryView() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const params = useLocalSearchParams<{
    elapsedSec?: string;
    distKm?: string;
    steps?: string;
    goalName?: string;
  }>();
  // router param は文字列かつ未検証のため、formatClock が例外を投げる負値/非有限値をガードする。
  const elapsedSec = Math.max(0, Number(params.elapsedSec ?? 0) || 0);
  const distKm = params.distKm ?? "0.0";
  const steps = Math.max(0, Number(params.steps ?? 0) || 0);
  const goalName = params.goalName;

  return (
    <View
      testID="walk-summary-screen"
      style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Icon name="footprints" size={40} color={theme.colors.primary} />
        </View>
        <Text style={styles.title}>おつかれさまでした</Text>
        <Text style={styles.subtitle}>
          {goalName ? `${goalName}までの散歩を記録しました。` : "今日の散歩を記録しました。"}
        </Text>
      </View>

      <Card style={styles.statsCard}>
        <View style={styles.statRow}>
          <StatBlock value={formatClock(elapsedSec)} label="経過時間" />
          <StatBlock value={distKm} unit="km" label="歩行距離" />
          <StatBlock value={steps.toLocaleString()} unit="歩" label="歩数" />
        </View>
      </Card>

      <View style={styles.actions}>
        <Button
          testID="walk-summary-view-history"
          variant="primary"
          fullWidth
          icon="bar-chart-2"
          onPress={() => router.replace("/(tabs)/history")}
        >
          記録を見る
        </Button>
        <Button
          testID="walk-summary-back-home"
          variant="ghost"
          fullWidth
          onPress={() => router.replace("/(tabs)")}
        >
          ホームへ
        </Button>
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
    paddingHorizontal: theme.layout.pageGutter + 4,
    justifyContent: "space-between",
  },
  hero: {
    alignItems: "center",
    gap: theme.spacing[2],
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing[2],
  },
  title: {
    fontSize: theme.typography.size["2xl"],
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  statsCard: {
    marginTop: theme.spacing[6],
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actions: {
    gap: theme.spacing[3],
  },
}));
