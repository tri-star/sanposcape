import { useFocusEffect, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { WalkActiveHeader } from "@/features/walk/active/components/WalkActiveHeader";
import { WalkActiveNotices } from "@/features/walk/active/components/WalkActiveNotices";
import { WalkEndDialog } from "@/features/walk/active/components/WalkEndDialog";
import { WalkIdleNotice } from "@/features/walk/active/components/WalkIdleNotice";
import { WalkPerfDebugOverlay } from "@/features/walk/active/components/WalkPerfDebugOverlay";
import { WalkRouteMapView } from "@/features/walk/active/components/WalkRouteMapView";
import { WalkStatsPanel } from "@/features/walk/active/components/WalkStatsPanel";
import { useActiveWalk } from "@/features/walk/active/hooks/useActiveWalk";
import {
  resolveAddPinAction,
  resolveMapLongPressPinAction,
} from "@/features/walk/active/lib/addPinAction";
import { shouldShowApproximateLocationNotice } from "@/features/walk/shared/lib/locationPrecisionNotice";
import { useToast } from "@/hooks/useToast";
import { consumeFlashMessage } from "@/lib/flashMessage";
import type { MapRegion, MapRegionRequest } from "@/lib/mapRegion";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/** `renderMapLayers` に渡す、地図を操作する関数。 */
export type WalkMapLayerActions = {
  focusRegion: (region: MapRegion) => void;
};

export type WalkActiveViewProps = {
  /**
   * 散歩中の地図に重ねる追加レイヤー（`MapView` の子）を、現在の表示範囲から作る（SS-118）。
   * `features/walk` は `features/sanpo-map` を import しないため、ルート（`app/(tabs)/index.tsx`）が
   * 登録済みピンのレイヤーを合成して渡す。省略時は何も重ねない。
   * `actions.focusRegion` で地図を指定の表示範囲へ動かせる（登録済みピンのクラスタのタップ。SS-243）。
   * レイヤーの `React.memo` が毎秒の再レンダーで破れないよう、`focusRegion` の参照は変えない。
   */
  renderMapLayers?: (visibleRegion: MapRegion | null, actions: WalkMapLayerActions) => ReactNode;
  /**
   * 散歩中の地図の右上のツール列（現在地ボタンの上）に足すボタン（SS-174）。`renderMapLayers` と同じ理由で、
   * ルートが登録済みピンの絞り込み（`PinMapFilterControl`）を合成して渡す。省略時は現在地ボタンだけ。
   */
  mapTools?: ReactNode;
  /**
   * 散歩していないとき、`WalkIdleNotice` の下に描く追加セクション（SS-147）。
   * `features/walk` は `features/history` を import しないため、ルート（`app/(tabs)/index.tsx`）が
   * 「最近の散歩」（`RecentWalksSection`）を合成して渡す。散歩中は描かない（マウントしないので、
   * セクション内の取得（`GET /walks`）も走らない）。省略時は何も出さない。
   */
  idleSection?: ReactNode;
  /**
   * 散歩中の地図の左上に、軌跡の点の数と JS の FPS を出す開発用の表示（`WalkPerfDebugOverlay`）を置くか（SS-229）。
   * `features/walk` は開発ツールの判定（`src/config/devTools.ts`。`app/` からしか import できない）を知らないため、
   * ルートが `isDevToolsEnabled()` を渡す。省略時は出さない。
   */
  showPerfDebug?: boolean;
};

/**
 * 散歩中（ナビタブ）画面。
 * 進行中の散歩が無ければ `WalkIdleNotice` を出し、あれば実地図・実位置トラッキング・
 * 実時刻ベースの経過時間を `useActiveWalk` から受けて表示する。
 *
 * 進行中の散歩が無いときは `WalkIdleNotice` と、ルートが合成した `idleSection`（最近の散歩。SS-147）を
 * 出す（ピンの導線はピンタブに集約。SS-146/SS-147）。散歩中は地図の長押しでその地点のピン登録へ進める
 * （SS-124）。散歩中の地図には登録済みピンが重なる（ルートが合成。SS-118）。
 */
export function WalkActiveView({
  renderMapLayers,
  mapTools,
  idleSection,
  showPerfDebug = false,
}: WalkActiveViewProps = {}) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const walk = useActiveWalk();
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [visibleRegion, setVisibleRegion] = useState<MapRegion | null>(null);
  const [regionRequest, setRegionRequest] = useState<MapRegionRequest | null>(null);
  const focusRegion = useCallback((region: MapRegion) => {
    setRegionRequest((previous) => ({ region, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  const handleConfirmEnd = () => {
    setEndDialogOpen(false);
    // ドラフトを確定（useFinishedWalkStore へ積む）してから進行中の散歩を終了する。
    // 保存（POST /walks）はサマリ画面（useWalkSummary）が行う。
    walk.finishWalk();
    router.push("/walk-summary");
  };

  // 散歩中の地図の長押し → その地点で登録画面へ（散歩に紐付ける）。戻ると散歩中画面に戻るよう push する
  // （「この場所にピンを追加」と同じ）。座標不正なら何もしない。
  const handleMapLongPress = (coordinate: { latitude: number; longitude: number }) => {
    const action = resolveMapLongPressPinAction({
      pressedPosition: coordinate,
      clientWalkId: walk.activeWalk?.clientWalkId ?? null,
    });
    if (action === null) return;
    router.push({ pathname: "/pins/new", params: action.params });
  };

  const handleAddPin = () => {
    const action = resolveAddPinAction({
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
    return (
      <View testID="walk-active-screen" style={styles.root}>
        <ScrollView
          // 上端はステータスバーの高さぶん下げる（SS-147。以前は余白が無くカードがステータスバーに重なっていた）。
          // タブ画面なので下端に insets.bottom は足さない（AppTabBar が負担する。PinTabView と同じ）。
          contentContainerStyle={[styles.idleContent, { paddingTop: insets.top }]}
          showsVerticalScrollIndicator={false}
        >
          <WalkIdleNotice onStart={() => router.replace("/walk-start")} />
          {idleSection ? <View style={styles.idleSection}>{idleSection}</View> : null}
        </ScrollView>
        {/* ピン登録から戻ったときの保存完了トースト（useFocusEffect の consumeFlashMessage）の表示先。
            SS-147 で FAB・地点選択画面を撤去したので通常は届かないが、消費だけされて黙って捨てられないよう残す。
            タブ画面なので insets.bottom は足さない（PinTabView と同じ）。 */}
        <ToastOverlay message={toast.message} visible={toast.visible} bottom={theme.spacing[4]} />
      </View>
    );
  }

  const { activeWalk } = walk;
  const approximateLocation = shouldShowApproximateLocationNotice(walk.locationPrecision);

  return (
    <View testID="walk-active-screen" style={styles.root}>
      <WalkActiveHeader
        loopMinutes={activeWalk.loopMinutes}
        loopKm={activeWalk.loopKm}
        destinationName={activeWalk.destination.name}
        paddingTop={insets.top + 8}
        onOpenSettings={() => router.push("/settings")}
      />

      <WalkRouteMapView
        walkRoute={walk.walkRoute}
        currentPosition={walk.currentPosition}
        trail={walk.points}
        destinationName={activeWalk.destination.name}
        recenterNonce={recenterNonce}
        regionRequest={regionRequest}
        height={322}
        onLongPress={handleMapLongPress}
        onRegionChangeComplete={setVisibleRegion}
        mapLayers={renderMapLayers?.(visibleRegion, { focusRegion })}
        testID="walk-active-map"
      >
        {showPerfDebug ? (
          <WalkPerfDebugOverlay pointCount={walk.points.length} testID="walk-active-perf-debug" />
        ) : null}
        <View style={styles.mapTools}>
          {mapTools}
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

      <WalkActiveNotices
        walkRouteErrorCode={walk.walkRouteErrorCode}
        onRetryWalkRoute={walk.retryWalkRoute}
        trackingErrorCode={walk.trackingErrorCode}
        onRetryTracking={walk.retryTracking}
        approximateLocation={approximateLocation}
      />

      <View style={styles.statsWrap}>
        <WalkStatsPanel
          elapsedSec={walk.elapsedSec}
          distanceMeters={walk.distanceMeters}
          steps={walk.steps}
          paused={walk.paused}
          trackingStatus={walk.trackingStatus}
          approximateLocation={approximateLocation}
          onTogglePause={walk.togglePause}
          onEnd={() => setEndDialogOpen(true)}
          onAddPin={handleAddPin}
        />
      </View>

      <WalkEndDialog
        open={endDialogOpen}
        elapsedSec={walk.elapsedSec}
        distanceMeters={walk.distanceMeters}
        onClose={() => setEndDialogOpen(false)}
        onConfirm={handleConfirmEnd}
      />

      <ToastOverlay message={toast.message} visible={toast.visible} bottom={insets.bottom + 96} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
  mapTools: {
    position: "absolute",
    right: theme.spacing[3],
    top: theme.spacing[3],
    gap: theme.spacing[2],
  },
  idleContent: {
    paddingBottom: theme.spacing[6],
  },
  idleSection: {
    paddingHorizontal: theme.layout.pageGutter,
  },
  statsWrap: {
    margin: theme.spacing[3],
  },
}));
