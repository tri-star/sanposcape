import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import walkerImage from "@/assets/images/walker.png";
import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { LocationPermissionNotice } from "@/features/walk/components/LocationPermissionNotice";
import { WalkIdleNotice } from "@/features/walk/components/WalkIdleNotice";
import { WalkRouteMapView } from "@/features/walk/components/WalkRouteMapView";
import { WalkStatsPanel } from "@/features/walk/components/WalkStatsPanel";
import { useActiveWalk } from "@/features/walk/hooks/useActiveWalk";
import { isRetriableExploreError } from "@/features/walk/lib/exploreError";
import { toKilometers, toOneWayMinutes } from "@/features/walk/lib/walkRoute";
import { walkRouteErrorMessage } from "@/features/walk/lib/walkRouteError";
import { useToast } from "@/hooks/useToast";
import { formatClock } from "@/lib/formatClock";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/**
 * 散歩中（ナビタブ）画面。
 * 進行中の散歩が無ければ `WalkIdleNotice` を出し、あれば実地図・実位置トラッキング・
 * 実時刻ベースの経過時間を `useActiveWalk` から受けて表示する。
 */
export function WalkActiveView() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const walk = useActiveWalk();
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [recenterNonce, setRecenterNonce] = useState(0);

  const isDark = theme.name === "dark";

  const handleConfirmEnd = () => {
    setEndDialogOpen(false);
    // ドラフトを確定（useFinishedWalkStore へ積む）してから進行中の散歩を終了する。
    // 保存（POST /walks）はサマリ画面（useWalkSummary）が行う。
    walk.finishWalk();
    router.push("/walk-summary");
  };

  if (walk.activeWalk === null) {
    return (
      <View testID="walk-active-screen" style={styles.root}>
        <WalkIdleNotice onStart={() => router.replace("/walk-start")} />
      </View>
    );
  }

  const { activeWalk } = walk;
  const oneWayMinutes = walk.walkRoute ? toOneWayMinutes(walk.walkRoute.durationSeconds) : null;
  const oneWayKm = walk.walkRoute ? toKilometers(walk.walkRoute.distanceMeters) : null;

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
            ヘッダーの「往復の目安」（activeWalk.roundTripMinutes/roundTripKm）は散歩開始時点の
            探索結果スナップショット（/explore/places 由来）で、`ActiveWalk` はサーバーデータの
            コピーを持たない設計上、散歩中に再取得はしない。直下の「片道」は walkRoute
            （/explore/routes/walking の実ルート値）から都度計算しているため、算出元の異なる
            2つの「往復」相当の数値が近いが一致しない場面がありうる（`SpotCard`/`WalkRouteSummary`
            と同じ理由。プランが明示的に選んだ設計でありバグではない）。
          */}
          <Text style={styles.eyebrow}>往復の目安</Text>
          <View style={styles.headerValueRow}>
            <Text style={styles.headerValue}>{activeWalk.roundTripMinutes}</Text>
            <Text style={styles.headerUnit}>分（約{activeWalk.roundTripKm.toFixed(1)}km）</Text>
          </View>
          <Text style={styles.goalName}>ゴール：{activeWalk.destination.name}</Text>
          {oneWayMinutes !== null && oneWayKm !== null ? (
            <Text style={styles.oneWay}>
              片道 {oneWayMinutes}分・{oneWayKm}km
            </Text>
          ) : null}
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

      {walk.walkRouteErrorCode !== null ? (
        <View style={styles.routeNotice}>
          <Icon name="alert-circle" size={16} color={theme.colors.danger} />
          <Text style={styles.routeNoticeText}>
            {walkRouteErrorMessage(walk.walkRouteErrorCode)}
          </Text>
          {isRetriableExploreError(walk.walkRouteErrorCode) ? (
            <Button
              variant="secondary"
              size="sm"
              onPress={walk.retryWalkRoute}
              testID="walk-active-route-retry"
            >
              再試行
            </Button>
          ) : null}
        </View>
      ) : null}

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
          onAddPin={() => toast.show("準備中の機能です")}
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
  oneWay: {
    marginTop: 1,
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textTertiary,
  },
  mapTools: {
    position: "absolute",
    right: theme.spacing[3],
    top: theme.spacing[3],
    gap: theme.spacing[2],
  },
  routeNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[3],
    marginTop: theme.spacing[2],
    padding: theme.spacing[3],
    backgroundColor: theme.colors.dangerTint,
    borderRadius: theme.radius.md,
  },
  routeNoticeText: {
    flex: 1,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textPrimary,
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
