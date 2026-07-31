import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { CategorySheet } from "@/features/walk/components/CategorySheet";
import { DurationSlider } from "@/features/walk/components/DurationSlider";
import { LocationPermissionNotice } from "@/features/walk/components/LocationPermissionNotice";
import { SpotListSection } from "@/features/walk/components/SpotListSection";
import { SpotMapView } from "@/features/walk/components/SpotMapView";
import { WalkRouteSummary } from "@/features/walk/components/WalkRouteSummary";
import { CATEGORY_ORDER } from "@/features/walk/data/categories";
import { useWalkPlan } from "@/features/walk/hooks/useWalkPlan";
import { categorySummary } from "@/features/walk/lib/categorySummary";
import { DURATION_MAX, DURATION_MIN, DURATION_STEP } from "@/features/walk/lib/placeSearchRequest";
import { useActiveWalkStore } from "@/features/walk/store/useActiveWalkStore";
import { useToast } from "@/hooks/useToast";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/**
 * 散歩開始画面。実地図（`SpotMapView`）+ 現在地 + `/explore/places` 由来の候補を表示する。
 * スポットを選択すると `/explore/routes/walking` で徒歩ルートを取得して地図に重ね、
 * 「散歩を始める」を押すと `useActiveWalkStore` に開始情報を積んで散歩中（ナビタブ）へ遷移する。
 */
export function WalkStartView() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const plan = useWalkPlan();
  const startWalk = useActiveWalkStore((state) => state.startWalk);

  const catsSummary = categorySummary(plan.activeCategories, CATEGORY_ORDER.length);

  const handleStartWalk = () => {
    if (!plan.selectedSpot || !plan.origin || !plan.walkRoute) return;
    startWalk({
      origin: plan.origin,
      destination: {
        placeId: plan.selectedSpot.id,
        name: plan.selectedSpot.name,
        location: plan.selectedSpot.location,
      },
      roundTripMinutes: plan.selectedSpot.roundTripMinutes,
      roundTripKm: plan.selectedSpot.roundTripKm,
      startedAtMs: Date.now(),
    });
    router.replace("/(tabs)");
  };

  const startLabel = !plan.selectedSpot
    ? "目的地を選んでください"
    : plan.isLoadingWalkRoute
      ? "ルートを確認しています…"
      : "散歩を始める";

  return (
    <View testID="walk-start-screen" style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: insets.top + 8 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>コースを決める</Text>
            <Text style={styles.title}>どこまで歩く？</Text>
          </View>
          <IconButton
            icon="crosshair"
            label="現在地"
            variant="tinted"
            onPress={plan.retryLocation}
            disabled={plan.isLocating}
          />
        </View>

        {/*
          位置情報が取れていない間は地図・候補リストの代わりに通知だけを出す。
          候補は現在地起点でしか出せないため、リストを併置すると「権限エラー」と
          「スポットが見つかりません」が同時に出て矛盾した案内になる。
        */}
        {plan.locationErrorCode !== null ? (
          <LocationPermissionNotice
            errorCode={plan.locationErrorCode}
            onRetry={plan.retryLocation}
            testID="walk-start-location-notice"
          />
        ) : (
          <>
            <SpotMapView
              origin={plan.origin}
              durationMin={plan.durationMin}
              candidates={plan.candidates}
              selectedSpotId={plan.selectedSpotId}
              onSelectSpot={plan.selectSpot}
              walkRoute={plan.walkRoute}
              testID="walk-start-map"
              style={styles.map}
            />

            <SpotListSection
              candidates={plan.candidates}
              selectedSpotId={plan.selectedSpotId}
              onSelectSpot={plan.selectSpot}
              isLoading={plan.isLoadingCandidates}
              isRefetching={plan.isRefetchingCandidates}
              errorCode={plan.exploreErrorCode}
              onRetry={plan.retryExplore}
              testID="walk-start-spot-list"
            />
          </>
        )}

        <View style={[styles.controls, { paddingBottom: insets.bottom + 26 }]}>
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

          {plan.selectedSpot ? (
            <WalkRouteSummary
              spot={plan.selectedSpot}
              walkRoute={plan.walkRoute}
              isLoading={plan.isLoadingWalkRoute}
              errorCode={plan.walkRouteErrorCode}
              onRetry={plan.retryWalkRoute}
            />
          ) : null}

          <Button
            variant="primary"
            icon="footprints"
            fullWidth
            disabled={!plan.canStartWalk}
            onPress={handleStartWalk}
            testID="walk-start-begin"
          >
            {startLabel}
          </Button>
        </View>
      </ScrollView>

      <CategorySheet
        open={plan.catSheetOpen}
        onClose={plan.closeCatSheet}
        activeCategories={plan.draftCategories}
        onToggle={plan.toggleCategory}
        onApply={plan.applyCategories}
        doneLabel="この条件で探す"
      />

      <ToastOverlay message={toast.message} visible={toast.visible} bottom={insets.bottom + 24} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3] - 2,
    paddingHorizontal: theme.layout.pageGutter + 2,
    paddingBottom: theme.spacing[2] + 2,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    fontSize: theme.typography.size.xs,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textTertiary,
  },
  title: {
    fontSize: theme.typography.size.xl + 2,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  map: {
    marginHorizontal: theme.layout.pageGutter - 2,
    marginTop: theme.spacing[1],
    borderRadius: theme.radius.lg,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.borderSubtle,
    overflow: "hidden",
  },
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
