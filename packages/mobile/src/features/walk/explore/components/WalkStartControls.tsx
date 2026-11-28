import { Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import { DurationSlider } from "@/features/walk/explore/components/DurationSlider";
import { CATEGORY_ORDER } from "@/features/walk/explore/data/categories";
import type { UseWalkPlanResult } from "@/features/walk/explore/hooks/useWalkPlan";
import { categorySummary } from "@/features/walk/explore/lib/categorySummary";
import {
  DURATION_MAX,
  DURATION_MIN,
  DURATION_STEP,
} from "@/features/walk/explore/lib/placeSearchRequest";
import { WalkRouteSummary } from "@/features/walk/route/components/WalkRouteSummary";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkStartControlsProps = {
  plan: UseWalkPlanResult;
  /** ピンを目的地にして開いたとき（SS-170）。往復時間・カテゴリ（候補の探索の条件）を出さない。 */
  isPinDestination?: boolean;
  /** 下端の余白（セーフエリアを含む）。 */
  paddingBottom: number;
  /** 「散歩を始める」。 */
  onStartWalk: () => void;
};

/** 散歩開始画面（`WalkStartView`）の下の操作の面（時間・表示するスポット・ルートの要約・開始のボタン）。 */
export function WalkStartControls({
  plan,
  isPinDestination = false,
  paddingBottom,
  onStartWalk,
}: WalkStartControlsProps) {
  const theme = useTheme();
  const styles = useStyles();
  const catsSummary = categorySummary(plan.activeCategories, CATEGORY_ORDER.length);

  // ピンを目的地にしたときは目的地が最初から決まっているので、現在地が取れるまでの間も文言で示す
  // （ルートの要求は現在地が無いと始まらず、「散歩を始める」のまま押せない状態に見えるため）。
  const startLabel = !plan.destination
    ? "目的地を選んでください"
    : plan.origin === null
      ? plan.locationErrorCode !== null
        ? "現在地を取得できません"
        : "現在地を確認しています…"
      : plan.isDestinationOutOfRange
        ? "目的地が遠すぎます"
        : plan.isLoadingWalkRoute
          ? "ルートを確認しています…"
          : "散歩を始める";

  return (
    <View style={[styles.controls, { paddingBottom }]}>
      {/* 往復時間・カテゴリは候補の探索の条件なので、目的地がピンに決まっているときは出さない。 */}
      {isPinDestination ? null : (
        <>
          <DurationSlider
            value={plan.durationMin}
            min={DURATION_MIN}
            max={DURATION_MAX}
            step={DURATION_STEP}
            onChange={plan.setDurationMin}
            onCommit={plan.commitDurationMin}
            testID="walk-start-duration-slider"
          />

          <Pressable
            accessibilityRole="button"
            onPress={plan.openCatSheet}
            testID="walk-start-open-category-sheet"
            style={({ pressed }) => [
              styles.categoryRow,
              { transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
          >
            <Icon name="sliders-horizontal" size={17} color={theme.colors.primary} />
            <Text style={styles.categoryRowLabel}>表示するスポット</Text>
            <Text style={styles.catsSummaryText}>{catsSummary}</Text>
            <Icon name="chevron-right" size={16} color={theme.colors.textTertiary} />
          </Pressable>
        </>
      )}

      {plan.destination ? (
        <WalkRouteSummary
          destinationName={plan.destination.name}
          roundTripMinutes={plan.selectedSpot?.roundTripMinutes ?? null}
          walkRoute={plan.walkRoute}
          isLoading={plan.isLoadingWalkRoute}
          errorCode={plan.walkRouteErrorCode}
          onRetry={plan.retryWalkRoute}
          isOutOfRange={plan.isDestinationOutOfRange}
        />
      ) : null}

      <Button
        variant="primary"
        icon="footprints"
        fullWidth
        disabled={!plan.canStartWalk}
        onPress={onStartWalk}
        testID="walk-start-begin"
      >
        {startLabel}
      </Button>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  controls: {
    marginTop: theme.spacing[6],
    backgroundColor: theme.colors.surfaceCard,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing[5],
    gap: theme.spacing[4],
    ...theme.shadows.sheet,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3] - 2,
    width: "100%",
    paddingVertical: theme.spacing[3] + 1,
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.surfaceSunken,
    borderWidth: 1.5,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.md,
  },
  categoryRowLabel: {
    flex: 1,
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  catsSummaryText: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
}));
