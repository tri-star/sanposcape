import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { CategorySheet } from "@/features/walk/explore/components/CategorySheet";
import { WalkStartControls } from "@/features/walk/explore/components/WalkStartControls";
import { WalkStartSpots } from "@/features/walk/explore/components/WalkStartSpots";
import { useWalkPlan } from "@/features/walk/explore/hooks/useWalkPlan";
import { toRouteMinutes } from "@/features/walk/route/lib/walkRoute";
import { useActiveWalkStore } from "@/features/walk/active/store/useActiveWalkStore";
import { useScreenBack } from "@/hooks/useScreenBack";
import { useToast } from "@/hooks/useToast";
import { toKilometers } from "@/lib/units";
import { randomUuidV4 } from "@/lib/uuid";
import { makeStyles } from "@/theme/makeStyles";

/** 戻り先/開始後の遷移先の既定ホーム（ナビタブ）。2箇所で直書きしないよう定数化する。 */
const HOME_HREF = "/(tabs)";

/**
 * 散歩開始画面。実地図（`SpotMapView`）+ 現在地 + `/explore/places` 由来の候補を表示する。
 * スポットを選択すると `/explore/routes/loop` で周回ルートを取得して地図に重ね、
 * 「散歩を始める」を押すと `useActiveWalkStore` に開始情報を積んで散歩中（ナビタブ）へ遷移する。
 */
export function WalkStartView() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const plan = useWalkPlan();
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

  // 意図的に onIntercept を経由しない: カテゴリシートが開いている間は「散歩を始める」ボタン自体を
  // 押せない（シートがコンテンツを覆う）ため、シートを閉じる分岐と衝突する実害が無い。
  // runOnce のラッチだけを goBack と共有し、戻る連打・戻る＋開始の同時押しでも遷移は1回にする。
  const handleStartWalk = () => {
    const { selectedSpot, origin, destination, walkRoute } = plan;
    if (!selectedSpot || !origin || !destination || !walkRoute) return;
    back.runOnce(() => {
      startWalk({
        // 保存の冪等キー。散歩開始時に採番する（ADR-003 D3）。
        clientWalkId: randomUuidV4(),
        origin,
        // `useWalkPlan` 内部の useMemo と同じ値（selectedSpot 由来）を公開してもらったものをそのまま使う
        // （ここで再構築すると、フィールド追加時に片方だけ更新し忘れるリスクがあるため）。
        destination,
        loopMinutes: toRouteMinutes(walkRoute.durationSeconds),
        loopKm: toKilometers(walkRoute.distanceMeters),
        startedAtMs: Date.now(),
      });
      router.replace(HOME_HREF);
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
          <IconButton
            icon="chevron-left"
            label="戻る"
            variant="ghost"
            onPress={back.goBack}
            testID="walk-start-back"
          />
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

        <WalkStartSpots plan={plan} />

        <WalkStartControls
          plan={plan}
          paddingBottom={insets.bottom + 26}
          onStartWalk={handleStartWalk}
        />
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
}));
