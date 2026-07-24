import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { CategorySheet } from "@/features/walk/components/CategorySheet";
import { DurationSlider } from "@/features/walk/components/DurationSlider";
import { MapCanvas, type MapCanvasPin } from "@/features/walk/components/MapCanvas";
import { SpotCard } from "@/features/walk/components/SpotCard";
import { CATEGORY_META, CATEGORY_ORDER } from "@/features/walk/data/spots";
import { useWalkPlan } from "@/features/walk/hooks/useWalkPlan";
import { categorySummary } from "@/features/walk/lib/categorySummary";
import { useToast } from "@/hooks/useToast";
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

  const catsSummary = categorySummary(plan.activeCategories, CATEGORY_ORDER.length);

  const pins: MapCanvasPin[] = plan.reachable.map((spot) => {
    const meta = CATEGORY_META[spot.category];
    const selected = spot.id === plan.selectedSpotId;
    return {
      id: spot.id,
      category: selected ? "goal" : meta.pin,
      accessibilityLabel: spot.name,
      size: selected ? 42 : 30,
      zIndex: selected ? 20 : 5,
      x: spot.x,
      y: spot.y,
      onPress: () => plan.selectSpot(spot.id),
    };
  });

  const handleStartWalk = () => {
    if (!plan.selectedSpot) return;
    router.replace({
      pathname: "/(tabs)",
      params: {
        goalName: plan.selectedSpot.name,
        goalTimeMin: String(plan.selectedSpot.time),
        goalDistKm: plan.selectedSpot.dist.toFixed(1),
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
            onPress={() => toast.show("準備中の機能です")}
          />
        </View>

        <MapCanvas pins={pins} style={styles.map} testID="walk-start-map" />

        <View style={styles.spotsHeader}>
          <Text style={styles.spotsTitle}>歩いて行けるスポット</Text>
          <Text style={styles.spotsCount}>
            <Text style={styles.spotsCountValue}>{plan.reachable.length}</Text> 件
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.spotList}
        >
          {plan.reachable.map((spot) => (
            <SpotCard
              key={spot.id}
              spot={spot}
              meta={CATEGORY_META[spot.category]}
              selected={spot.id === plan.selectedSpotId}
              onPress={() => plan.selectSpot(spot.id)}
              testID={`spot-card-${spot.id}`}
            />
          ))}
        </ScrollView>

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

          {plan.selectedSpot ? (
            <View style={styles.selectedRow} testID="walk-start-selected-summary">
              <Icon name="flag" size={18} color={theme.colors.primary} />
              <View style={styles.selectedText}>
                <Text style={styles.selectedLabel}>目的地</Text>
                <Text style={styles.selectedName}>{plan.selectedSpot.name}</Text>
              </View>
              <Text style={styles.selectedTime}>往復 {plan.selectedSpot.time}分</Text>
            </View>
          ) : null}

          <Button
            variant="primary"
            icon="footprints"
            fullWidth
            disabled={!plan.selectedSpot}
            onPress={handleStartWalk}
            testID="walk-start-begin"
          >
            {plan.selectedSpot ? "散歩を始める" : "目的地を選んでください"}
          </Button>
        </View>
      </ScrollView>

      <CategorySheet
        open={plan.catSheetOpen}
        onClose={plan.closeCatSheet}
        activeCategories={plan.activeCategories}
        onToggle={plan.toggleCategory}
        doneLabel={`${plan.reachable.length}件のスポットを表示`}
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
