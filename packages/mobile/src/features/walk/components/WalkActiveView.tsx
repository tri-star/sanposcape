import { useFocusEffect, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { Image, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import walkerImage from "@/assets/images/walker.png";
import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { LocationPermissionNotice } from "@/components/location/LocationPermissionNotice";
import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";
import { WalkIdleNotice } from "@/features/walk/components/WalkIdleNotice";
import { WalkRouteMapView } from "@/features/walk/components/WalkRouteMapView";
import { WalkRouteNotice } from "@/features/walk/components/WalkRouteNotice";
import { WalkStatsPanel } from "@/features/walk/components/WalkStatsPanel";
import { useActiveWalk } from "@/features/walk/hooks/useActiveWalk";
import {
  resolveAddPinAction,
  resolveMapLongPressPinAction,
} from "@/features/walk/lib/addPinAction";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useToast } from "@/hooks/useToast";
import { consumeFlashMessage } from "@/lib/flashMessage";
import { formatClock } from "@/lib/formatClock";
import type { MapRegion } from "@/lib/mapRegion";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkActiveViewProps = {
  /**
   * 散歩中の地図に重ねる追加レイヤー（`MapView` の子）を、現在の表示範囲から作る（SS-118）。
   * `features/walk` は `features/pin` を import しないため、ルート（`app/(tabs)/index.tsx`）が
   * 登録済みピンのレイヤーを合成して渡す。省略時は何も重ねない。
   */
  renderMapLayers?: (visibleRegion: MapRegion | null) => ReactNode;
};

/**
 * 散歩中（ナビタブ）画面。
 * 進行中の散歩が無ければ `WalkIdleNotice` を出し、あれば実地図・実位置トラッキング・
 * 実時刻ベースの経過時間を `useActiveWalk` から受けて表示する。
 *
 * 進行中の散歩が無いときは、`pin_registration` が ON なら「地図からピンを置く」FAB（アイコンのみ）と
 * 「登録したピンを地図で見る」ボタン（SS-118）を出す。散歩中は FAB を出さず、地図の長押しでその
 * 地点のピン登録へ進める（SS-124）。散歩中の地図には登録済みピンが重なる（ルートが合成。SS-118）。
 */
export function WalkActiveView({ renderMapLayers }: WalkActiveViewProps = {}) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const walk = useActiveWalk();
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [visibleRegion, setVisibleRegion] = useState<MapRegion | null>(null);
  const pinRegistrationEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.pinRegistration);

  const isDark = theme.name === "dark";

  const handleConfirmEnd = () => {
    setEndDialogOpen(false);
    // ドラフトを確定（useFinishedWalkStore へ積む）してから進行中の散歩を終了する。
    // 保存（POST /walks）はサマリ画面（useWalkSummary）が行う。
    walk.finishWalk();
    router.push("/walk-summary");
  };

  // 進行中の散歩が無いとき（ナビタブの FAB）は clientWalkId を付けない（値が無い。SS-124 D2）。
  // features/pin は import せず、ルートの文字列だけを知る（addPinAction.ts のコメントにある
  // feature 間の規約）。
  const handleOpenPinPicker = () => router.push("/pins/pick-location");

  // 散歩中の地図の長押し → その地点で登録画面へ（散歩に紐付ける）。戻ると散歩中画面に戻るよう push する
  // （「この場所にピンを追加」と同じ）。フラグ OFF・座標不正なら何もしない。
  const handleMapLongPress = (coordinate: { latitude: number; longitude: number }) => {
    const action = resolveMapLongPressPinAction({
      featureEnabled: pinRegistrationEnabled,
      pressedPosition: coordinate,
      clientWalkId: walk.activeWalk?.clientWalkId ?? null,
    });
    if (action === null) return;
    router.push({ pathname: "/pins/new", params: action.params });
  };

  const handleAddPin = () => {
    const action = resolveAddPinAction({
      featureEnabled: pinRegistrationEnabled,
      currentPosition: walk.currentPosition,
      clientWalkId: walk.activeWalk?.clientWalkId ?? null,
    });
    if (action.type === "toast") {
      toast.show(action.message);
      return;
    }
    router.push({ pathname: "/pins/new", params: action.params });
  };

  // ピン登録画面から戻ってきたときの保存完了トースト（`useFinishedWalkStore` を経由しない
  // 画面またぎのメッセージ受け渡し。`src/lib/flashMessage.ts` 参照）。
  // 早期 return（`walk.activeWalk === null`）より前に置くことで、進行中の散歩が無い状態で
  // 戻ってきた場合でもトーストを取りこぼさない。
  useFocusEffect(
    useCallback(() => {
      const message = consumeFlashMessage();
      if (message) toast.show(message);
    }, [toast]),
  );

  if (walk.activeWalk === null) {
    // FAB（theme.control.lg = 54）と重ならない高さにトーストを浮かせる。
    const idleToastBottom = theme.spacing[4] + theme.control.lg + theme.spacing[3];
    return (
      <View testID="walk-active-screen" style={styles.root}>
        <WalkIdleNotice onStart={() => router.replace("/walk-start")} />
        {pinRegistrationEnabled ? (
          <Button
            variant="secondary"
            icon="map"
            onPress={() => router.push("/pins/map")}
            style={styles.pinMapButton}
            testID="walk-active-open-pin-map"
          >
            登録したピンを地図で見る
          </Button>
        ) : null}
        {pinRegistrationEnabled ? (
          <IconButton
            variant="filled"
            size="lg"
            icon="map-pin"
            label="地図からピンを置く"
            onPress={handleOpenPinPicker}
            style={styles.pinFab}
            testID="walk-active-pin-fab"
          />
        ) : null}
        {/*
          このトーストが無いと、ピン登録画面から戻ってきた「ピンを保存しました」
          （useFocusEffect の consumeFlashMessage）が消費されるだけで表示されない
          （FAB 経由の登録で初めて表に出る既存の抜け。SS-124 で合わせて直す）。
        */}
        <ToastOverlay message={toast.message} visible={toast.visible} bottom={idleToastBottom} />
      </View>
    );
  }

  const { activeWalk } = walk;

  return (
    <View testID="walk-active-screen" style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {isDark ? (
          <View style={styles.illustrationTint}>
            <Icon name="footprints" size={24} color={theme.colors.primary} />
          </View>
        ) : (
          <Image source={walkerImage} resizeMode="cover" style={styles.illustration} />
        )}
        <View style={styles.headerText}>
          {/*
            値は散歩開始時点の周回ルート実値（WalkStartView が積む）。散歩中は取り直さない（SS-33）。
          */}
          <Text style={styles.eyebrow}>周回の目安</Text>
          <View style={styles.headerValueRow}>
            <Text style={styles.headerValue}>{activeWalk.loopMinutes}</Text>
            <Text style={styles.headerUnit}>分（約{activeWalk.loopKm.toFixed(1)}km）</Text>
          </View>
          <Text style={styles.goalName}>ゴール：{activeWalk.destination.name}</Text>
        </View>
        <IconButton
          icon="settings-2"
          label="設定"
          variant="tinted"
          onPress={() => router.push("/settings")}
        />
      </View>

      <WalkRouteMapView
        walkRoute={walk.walkRoute}
        currentPosition={walk.currentPosition}
        destinationName={activeWalk.destination.name}
        recenterNonce={recenterNonce}
        height={322}
        onLongPress={handleMapLongPress}
        onRegionChangeComplete={setVisibleRegion}
        mapLayers={renderMapLayers?.(visibleRegion)}
        testID="walk-active-map"
      >
        <View style={styles.mapTools}>
          <IconButton
            icon="crosshair"
            label="現在地"
            variant="surface"
            size="sm"
            testID="walk-active-recenter"
            onPress={() => setRecenterNonce((n) => n + 1)}
          />
        </View>
      </WalkRouteMapView>

      <WalkRouteNotice errorCode={walk.walkRouteErrorCode} onRetry={walk.retryWalkRoute} />

      {walk.trackingErrorCode !== null ? (
        <LocationPermissionNotice
          errorCode={walk.trackingErrorCode}
          onRetry={walk.retryTracking}
          testID="walk-active-location-notice"
        />
      ) : null}

      <View style={styles.statsWrap}>
        <WalkStatsPanel
          elapsedSec={walk.elapsedSec}
          distanceMeters={walk.distanceMeters}
          steps={walk.steps}
          paused={walk.paused}
          trackingStatus={walk.trackingStatus}
          onTogglePause={walk.togglePause}
          onEnd={() => setEndDialogOpen(true)}
          onAddPin={handleAddPin}
        />
      </View>

      <Dialog
        open={endDialogOpen}
        title="散歩を終了しますか？"
        onClose={() => setEndDialogOpen(false)}
        testID="walk-end-dialog"
        actions={
          <>
            <Button variant="secondary" fullWidth onPress={() => setEndDialogOpen(false)}>
              続ける
            </Button>
            <Button
              variant="primary"
              fullWidth
              onPress={handleConfirmEnd}
              testID="walk-end-confirm"
            >
              終了して記録
            </Button>
          </>
        }
      >
        <Text style={styles.dialogBody}>
          経過時間 {formatClock(walk.elapsedSec)}・約{(walk.distanceMeters / 1000).toFixed(1)}
          km を今日の記録に保存します。
        </Text>
      </Dialog>

      <ToastOverlay message={toast.message} visible={toast.visible} bottom={insets.bottom + 96} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.layout.pageGutter,
    paddingBottom: theme.spacing[2] + 2,
  },
  illustration: {
    width: 88,
    height: 48,
    borderRadius: theme.radius.md,
  },
  illustrationTint: {
    width: 88,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceTint,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textTertiary,
  },
  headerValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  headerValue: {
    fontSize: theme.typography.size["2xl"] + 2,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.primary,
  },
  headerUnit: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  goalName: {
    marginTop: 1,
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  mapTools: {
    position: "absolute",
    right: theme.spacing[3],
    top: theme.spacing[3],
    gap: theme.spacing[2],
  },
  pinMapButton: {
    marginHorizontal: theme.layout.pageGutter,
  },
  pinFab: {
    position: "absolute",
    right: theme.layout.pageGutter,
    bottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  statsWrap: {
    margin: theme.spacing[3],
  },
  dialogBody: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
    lineHeight: 24,
  },
}));
