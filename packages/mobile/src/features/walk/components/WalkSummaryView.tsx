import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { StatBlock } from "@/components/ui/stat-block/StatBlock";
import { WalkSaveStatus } from "@/features/walk/components/WalkSaveStatus";
import { useWalkSummary } from "@/features/walk/hooks/useWalkSummary";
import { formatClock } from "@/lib/formatClock";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/**
 * 散歩終了サマリ画面。mock に直接該当なし。
 * `isMain` の終了導線＋`isRecord` の StatBlock/Card トーンで補完する。
 * 表示値・保存状態は `useWalkSummary`（`useFinishedWalkStore` + `useWalkSave` の合成）から受け取る。
 * ドラフトが無い（deep link・画面カタログ直叩き）場合は代表値を表示し、保存は行わない。
 */
export function WalkSummaryView() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const summary = useWalkSummary();
  const { stats } = summary;

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
        <Text style={styles.subtitle}>{`${stats.goalName}までの散歩を記録しました。`}</Text>
      </View>

      <Card style={styles.statsCard}>
        <View style={styles.statRow}>
          <StatBlock value={formatClock(stats.elapsedSec)} label="経過時間" />
          <StatBlock value={stats.distanceKm.toFixed(1)} unit="km" label="歩行距離" />
          <StatBlock value={stats.steps.toLocaleString()} unit="歩" label="歩数" />
        </View>
      </Card>

      <WalkSaveStatus
        status={summary.saveStatus}
        errorCode={summary.saveErrorCode}
        onRetry={summary.retrySave}
        testID="walk-summary-save-status"
      />

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
