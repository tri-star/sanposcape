import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { CategorySheet } from "@/features/walk/components/CategorySheet";
import { DurationSlider } from "@/features/walk/components/DurationSlider";
import { ExploreMapCanvas } from "@/features/walk/components/ExploreMapCanvas";
import { SpotCard } from "@/features/walk/components/SpotCard";
import { CATEGORY_META, CATEGORY_ORDER } from "@/features/walk/data/spots";
import { useWalkPlan } from "@/features/walk/hooks/useWalkPlan";
import { categorySummary } from "@/features/walk/lib/categorySummary";
import {
  classifyExploreError,
  exploreErrorMessage,
  shouldKeepSelectedSpot,
} from "@/features/walk/lib/exploreState";
import { useCurrentLocation } from "@/features/walk/hooks/useCurrentLocation";
import { useExplorePlaces } from "@/features/walk/hooks/useExplorePlaces";
import { useWalkingRoute } from "@/features/walk/hooks/useWalkingRoute";
import { useToast } from "@/hooks/useToast";
import { locationService } from "@/services/location";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

const DURATION_MIN = 10;
const DURATION_MAX = 120;
const DURATION_STEP = 5;

/**
 * 散歩開始画面。mock `isStart` を1:1で再現する。
 * 「散歩を始める」→ 散歩中（ナビタブ）へ遷移し、目的地/往復時間を router params で渡す。
 */
export function WalkStartView() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const plan = useWalkPlan();
  const { clearSelectedSpot, selectedSpotId } = plan;
  const location = useCurrentLocation(locationService);
  const placesQuery = useExplorePlaces({
    origin: location.coordinates,
    durationMinutes: plan.durationMin,
    categories: plan.activeCategories,
  });
  const places = placesQuery.data;
  const displayedPlaces = places ?? [];
  const isPlacesLoading =
    location.coordinates !== null && (placesQuery.isPending || placesQuery.isFetching);
  const selectedSpot = displayedPlaces.find((spot) => spot.id === selectedSpotId) ?? null;
  const routeQuery = useWalkingRoute(location.coordinates, selectedSpot);

  const catsSummary = categorySummary(plan.activeCategories, CATEGORY_ORDER.length);

  useEffect(() => {
    if (
      places &&
      !shouldKeepSelectedSpot(
        selectedSpotId,
        places.map((spot) => spot.id),
      )
    ) {
      clearSelectedSpot();
    }
  }, [clearSelectedSpot, places, selectedSpotId]);

  const handleStartWalk = () => {
    if (!selectedSpot) return;
    router.replace({
      pathname: "/(tabs)",
      params: {
        goalName: selectedSpot.name,
        goalTimeMin: String(selectedSpot.roundTripDurationMinutes),
        goalDistKm: selectedSpot.roundTripDistanceKm.toFixed(1),
      },
    });
  };

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
            onPress={() => void location.refresh()}
          />
        </View>

        <ExploreMapCanvas
          origin={location.coordinates}
          spots={displayedPlaces}
          selectedSpotId={selectedSpotId}
          route={routeQuery.data}
          onSelectSpot={plan.selectSpot}
          onCurrentLocation={() => void location.refresh()}
          style={styles.map}
          testID="walk-start-map"
        />

        {location.isLoading ? <Text style={styles.status}>現在地を取得しています…</Text> : null}
        {location.error ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>
              {location.error === "permission-denied"
                ? "現在地の利用が許可されていません。許可して再試行してください。"
                : "現在地を取得できませんでした。"}
            </Text>
            <Button variant="secondary" onPress={() => void location.refresh()}>
              再試行
            </Button>
            {location.error === "permission-denied" ? (
              <Button variant="outline" onPress={() => void Linking.openSettings()}>
                設定を開く
              </Button>
            ) : null}
          </View>
        ) : null}

        <View style={styles.spotsHeader}>
          <Text style={styles.spotsTitle}>歩いて行けるスポット</Text>
          <Text style={styles.spotsCount}>
            <Text style={styles.spotsCountValue}>{displayedPlaces.length}</Text> 件
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.spotList}
        >
          {displayedPlaces.map((spot) => (
            <SpotCard
              key={spot.id}
              spot={spot}
              meta={CATEGORY_META[spot.category]}
              selected={spot.id === selectedSpotId}
              onPress={() => plan.selectSpot(spot.id)}
              testID={`spot-card-${spot.id}`}
            />
          ))}
          {isPlacesLoading ? <Text style={styles.status}>スポットを検索しています…</Text> : null}
          {!location.isLoading &&
          !location.error &&
          !isPlacesLoading &&
          displayedPlaces.length === 0 &&
          !placesQuery.isError ? (
            <Text style={styles.status}>条件に合うスポットがありません。</Text>
          ) : null}
        </ScrollView>

        {placesQuery.isError ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>
              {exploreErrorMessage(classifyExploreError(placesQuery.error))}
            </Text>
            <Button variant="secondary" onPress={() => void placesQuery.refetch()}>
              スポットを再試行
            </Button>
          </View>
        ) : null}
        {routeQuery.isError ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>徒歩経路を取得できませんでした。</Text>
            <Button variant="secondary" onPress={() => void routeQuery.refetch()}>
              経路を再試行
            </Button>
          </View>
        ) : null}

        <View style={[styles.controls, { paddingBottom: insets.bottom + 26 }]}>
          <DurationSlider
            value={plan.durationMin}
            min={DURATION_MIN}
            max={DURATION_MAX}
            step={DURATION_STEP}
            onChange={plan.setDurationMin}
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

          {selectedSpot ? (
            <View style={styles.selectedRow} testID="walk-start-selected-summary">
              <Icon name="flag" size={18} color={theme.colors.primary} />
              <View style={styles.selectedText}>
                <Text style={styles.selectedLabel}>目的地</Text>
                <Text style={styles.selectedName}>{selectedSpot.name}</Text>
              </View>
              <Text style={styles.selectedTime}>
                往復 {selectedSpot.roundTripDurationMinutes}分
              </Text>
            </View>
          ) : null}

          <Button
            variant="primary"
            icon="footprints"
            fullWidth
            disabled={!selectedSpot || routeQuery.isLoading || routeQuery.isError}
            onPress={handleStartWalk}
            testID="walk-start-begin"
          >
            {routeQuery.isLoading
              ? "経路を取得しています"
              : selectedSpot
                ? "散歩を始める"
                : "目的地を選んでください"}
          </Button>
        </View>
      </ScrollView>

      <CategorySheet
        open={plan.catSheetOpen}
        onClose={plan.closeCatSheet}
        activeCategories={plan.activeCategories}
        onToggle={plan.toggleCategory}
        doneLabel={`${displayedPlaces.length}件のスポットを表示`}
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
  },
  spotsHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: theme.layout.pageGutter + 4,
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  spotsTitle: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  spotsCount: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  spotsCountValue: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.primary,
  },
  spotList: {
    gap: theme.spacing[2] + 2,
    paddingHorizontal: theme.layout.pageGutter - 2,
    paddingVertical: theme.spacing[1],
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
  status: {
    paddingHorizontal: theme.layout.pageGutter + 4,
    paddingTop: theme.spacing[2],
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  errorState: {
    gap: theme.spacing[2],
    marginHorizontal: theme.layout.pageGutter - 2,
    marginTop: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceTint,
  },
  errorText: {
    paddingHorizontal: theme.layout.pageGutter + 4,
    paddingTop: theme.spacing[2],
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3] - 2,
    padding: theme.spacing[3] + 2,
    backgroundColor: theme.colors.surfaceTint,
    borderRadius: theme.radius.md,
  },
  selectedText: {
    flex: 1,
  },
  selectedLabel: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textSecondary,
  },
  selectedName: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  selectedTime: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
}));
