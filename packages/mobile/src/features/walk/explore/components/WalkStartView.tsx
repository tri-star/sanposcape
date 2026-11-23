import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { LocationPermissionNotice } from "@/components/location/LocationPermissionNotice";
import { ApproximateLocationNotice } from "@/features/walk/shared/components/ApproximateLocationNotice";
import { CategorySheet } from "@/features/walk/explore/components/CategorySheet";
import { DurationSlider } from "@/features/walk/explore/components/DurationSlider";
import { SpotListSection } from "@/features/walk/explore/components/SpotListSection";
import { SpotMapView } from "@/features/walk/explore/components/SpotMapView";
import { WalkRouteSummary } from "@/features/walk/route/components/WalkRouteSummary";
import { CATEGORY_ORDER } from "@/features/walk/explore/data/categories";
import { useWalkPlan } from "@/features/walk/explore/hooks/useWalkPlan";
import { categorySummary } from "@/features/walk/explore/lib/categorySummary";
import { shouldShowApproximateLocationNotice } from "@/features/walk/shared/lib/locationPrecisionNotice";
import {
  DURATION_MAX,
  DURATION_MIN,
  DURATION_STEP,
} from "@/features/walk/explore/lib/placeSearchRequest";
import { toRouteMinutes } from "@/features/walk/route/lib/walkRoute";
import type { WalkDestination } from "@/features/walk/shared/types";
import { useActiveWalkStore } from "@/features/walk/active/store/useActiveWalkStore";
import { useScreenBack } from "@/hooks/useScreenBack";
import { useToast } from "@/hooks/useToast";
import { toKilometers } from "@/lib/units";
import { randomUuidV4 } from "@/lib/uuid";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/** 戻り先/開始後の遷移先の既定ホーム（ナビタブ）。2箇所で直書きしないよう定数化する。 */
const HOME_HREF = "/(tabs)";
/**
 * ピンを目的地にしたときの地図の高さ（SS-170）。候補一覧・往復時間・カテゴリを出さないぶん空く縦を地図に回す
 * （通常は `SpotMapView` の既定の 296）。
 */
const PIN_DESTINATION_MAP_HEIGHT = 420;

export type WalkStartViewProps = {
  /**
   * ピンを目的地にして開いたとき（ピン詳細の「このピンまで散歩する」。SS-170）のピン。ルートがパラメータから作って渡す。
   * 渡すと候補の探索・一覧・往復時間・カテゴリを出さず、このピンまでの周回ルートだけを出す。
   */
  pinDestination?: WalkDestination | null;
};

/**
 * 散歩開始画面。実地図（`SpotMapView`）+ 現在地 + `/explore/places` 由来の候補を表示する。
 * スポットを選択すると `/explore/routes/loop` で周回ルートを取得して地図に重ね、
 * 「散歩を始める」を押すと `useActiveWalkStore` に開始情報を積んで散歩中（ナビタブ）へ遷移する。
 * `pinDestination` があれば、目的地はそのピンに決まった状態で開く（ADR-M-027）。
 */
export function WalkStartView({ pinDestination = null }: WalkStartViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const plan = useWalkPlan({ pinDestination });
  const isPinDestination = pinDestination !== null;
  const startWalk = useActiveWalkStore((state) => state.startWalk);

  // 戻り先は (tabs)。`/(tabs)` は `(tabs)/index`＝ナビタブに解決される。`/walk-start` にはナビタブの
  // 「散歩を始める」から入るため、戻り先・開始後の遷移先ともナビタブにする（SS-145 でログイン直後の
  // 着地点はピンタブになったが、ここは変えない。`WalkSummaryView` の「ホームへ」と同じ）。「散歩を始める」とラッチを共有し、
  // 戻る連打・戻る＋開始の同時押しでも遷移は1回に収まる。
  const back = useScreenBack({
    fallbackHref: HOME_HREF,
    // カテゴリシートが開いているときの「戻る」はシートを閉じるだけにする。
    // closeCatSheet は draft を破棄して閉じる＝キャンセルの意味と一致する。
    onIntercept: () => {
      if (!plan.catSheetOpen) return false;
      plan.closeCatSheet();
      return true;
    },
  });

  const catsSummary = categorySummary(plan.activeCategories, CATEGORY_ORDER.length);

  // 意図的に onIntercept を経由しない: カテゴリシートが開いている間は「散歩を始める」ボタン自体を
  // 押せない（シートがコンテンツを覆う）ため、シートを閉じる分岐と衝突する実害が無い。
  // runOnce のラッチだけを goBack と共有し、戻る連打・戻る＋開始の同時押しでも遷移は1回にする。
  const handleStartWalk = () => {
    const { origin, destination, walkRoute } = plan;
    if (!origin || !destination || !walkRoute) return;
    back.runOnce(() => {
      startWalk({
        // 保存の冪等キー。散歩開始時に採番する（ADR-003 D3）。
        clientWalkId: randomUuidV4(),
        origin,
        // `useWalkPlan` 内部の useMemo と同じ値（selectedSpot、またはピン由来）を公開してもらったものをそのまま使う
        // （ここで再構築すると、フィールド追加時に片方だけ更新し忘れるリスクがあるため）。
        destination,
        loopMinutes: toRouteMinutes(walkRoute.durationSeconds),
        loopKm: toKilometers(walkRoute.distanceMeters),
        startedAtMs: Date.now(),
      });
      if (isPinDestination) {
        // ピン詳細から push で来たので、下に積まれた (tabs) まで閉じてナビタブ（散歩中）へ戻す。
        // 下に無ければ（ディープリンクで開いた等）置き換える。ピン詳細の「ピンの場所に移動」と同じ。
        router.dismissTo(HOME_HREF);
      } else {
        router.replace(HOME_HREF);
      }
    });
  };

  // ピンを目的地にしたときは目的地が最初から決まっているので、現在地が取れるまでの間も文言で示す
  // （ルートの要求は現在地が無いと始まらず、「散歩を始める」のまま押せない状態に見えるため）。
  const startLabel = !plan.destination
    ? "目的地を選んでください"
    : plan.origin === null
      ? plan.locationErrorCode !== null
        ? "現在地を取得できません"
        : "現在地を確認しています…"
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
          <IconButton
            icon="chevron-left"
            label="戻る"
            variant="ghost"
            onPress={back.goBack}
            testID="walk-start-back"
          />
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>コースを決める</Text>
            <Text style={styles.title}>{isPinDestination ? "ピンまで歩く" : "どこまで歩く？"}</Text>
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
            context="explore"
            onRetry={plan.retryLocation}
            testID="walk-start-location-notice"
          />
        ) : (
          <>
            {shouldShowApproximateLocationNotice(plan.locationPrecision) ? (
              <ApproximateLocationNotice context="explore" testID="walk-start-approximate-notice" />
            ) : null}
            <SpotMapView
              origin={plan.origin}
              durationMin={plan.durationMin}
              candidates={plan.candidates}
              selectedSpotId={plan.selectedSpotId}
              onSelectSpot={plan.selectSpot}
              walkRoute={plan.walkRoute}
              fixedDestination={pinDestination}
              height={isPinDestination ? PIN_DESTINATION_MAP_HEIGHT : undefined}
              testID="walk-start-map"
              style={styles.map}
            />

            {isPinDestination ? null : (
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
            )}
          </>
        )}

        <View style={[styles.controls, { paddingBottom: insets.bottom + 26 }]}>
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
    // 戻るボタンが増えたぶん左右のガターを詰める（IconButton 2つ + タイトルの3分割バランス）。
    paddingHorizontal: theme.layout.pageGutter,
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
