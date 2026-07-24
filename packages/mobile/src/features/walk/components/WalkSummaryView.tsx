import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { StatBlock } from "@/components/ui/stat-block/StatBlock";
import { SAMPLE_WALK_RESULT } from "@/features/walk/data/defaults";
import { formatClock } from "@/lib/formatClock";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/**
 * router param（文字列・未検証）を非負整数へ変換する。
 * 非有限値（"Infinity" 等）や負値は 0 に丸め、formatClock 側の例外を防ぐ。
 */
function toNonNegInt(value: string | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

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
  // params 未指定時（画面カタログ等からの単独表示）は SAMPLE_WALK_RESULT の代表値を使う。
  const elapsedSec = params.elapsedSec
    ? toNonNegInt(params.elapsedSec)
    : SAMPLE_WALK_RESULT.elapsedSec;
  const distKm = params.distKm ?? SAMPLE_WALK_RESULT.distKm;
  const steps = params.steps ? toNonNegInt(params.steps) : SAMPLE_WALK_RESULT.steps;
  // "" は `??` で弾けないため、空文字列も未指定として扱いフォールバックさせる。
  const goalName = params.goalName?.trim() ? params.goalName : SAMPLE_WALK_RESULT.goalName;

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
        <Text style={styles.subtitle}>{`${goalName}までの散歩を記録しました。`}</Text>
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
