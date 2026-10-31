import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabActionBar } from "@/components/layout/TabActionBar";
import { LocationPermissionNotice } from "@/components/location/LocationPermissionNotice";
import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { PinMapCanvas } from "@/features/pin/components/PinMapCanvas";
import { PinMapFilterControl } from "@/features/pin/components/PinMapFilterControl";
import { PinMapStatusNotice } from "@/features/pin/components/PinMapStatusNotice";
import { RegisteredPinMarkers } from "@/features/pin/components/RegisteredPinMarkers";
import { usePinLocationPicker } from "@/features/pin/hooks/usePinLocationPicker";
import { useRegisteredPins } from "@/features/pin/hooks/useRegisteredPins";
import { buildPinNewRouteParams, regionAroundPoint } from "@/features/pin/lib/pinLocationPicker";
import { isDefaultPinMapFilter } from "@/features/pin/lib/pinMapFilter";
import { resolvePinMapNotice } from "@/features/pin/lib/pinMapNotice";
import type { PinTabFocus } from "@/features/pin/lib/pinTabFocus";
import { usePinMapFilterStore } from "@/features/pin/store/usePinMapFilterStore";
import { useNavigateOnce } from "@/hooks/useNavigateOnce";
import { useToast } from "@/hooks/useToast";
import { consumeFlashMessage } from "@/lib/flashMessage";
import type { MapRegion, MapRegionRequest } from "@/lib/mapRegion";
import type { GeoCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type PinTabViewProps = {
  /** ルート（`app/(tabs)/pins.tsx`）が `useAuthSessionStore` から注入する（features/pin は認証を読まない。ADR-M-009 決定8）。 */
  isSignedIn: boolean;
  onSignIn: () => void;
  /** ピン詳細の「ピンの場所に移動」から来たときの寄せる要求（SS-246）。ルートがパラメータを検証して渡す。 */
  focus?: PinTabFocus | null;
};

const PIN_TAB_HINT =
  "地図を長押しすると、その場所にピンを登録できます。ピンをタップすると詳細を表示します";

/**
 * PinTabView — ピンタブの実体（SS-146）。現在地起点の地図 + 登録済みピン + 長押しで登録 +
 * 状態表示 + ボタン配置エリア（`TabActionBar`）。
 *
 * - 地図の設定は `PinMapCanvas` に集約（`PinMapFullScreen` と共有）。全画面の枠はタブ画面に合わない
 *   （戻るボタン必須・下部が `insets.bottom` 前提）ので使わない。
 * - `RegisteredPinsMapLayer` は使わず `useRegisteredPins` + `RegisteredPinMarkers` を直接使う
 *   （読み込み・エラー・再試行・打ち切りの状態表示が要るため）。
 * - 長押しは `/pins/new` へ push（replace は `(tabs)` ごと置き換えてしまう）。保存後は
 *   `PinRegisterView` の `back()` でここへ戻り、下の `useFocusEffect` が保存完了トーストを出す。
 * - フラグ（pin_registration）は見ない（ルートのガード）。認証は props で受ける。
 * - 表示するピンの絞り込み（SS-174）は地図右上のツール列の `PinMapFilterControl` から。状態は散歩中の地図と共有する
 *   （`usePinMapFilterStore`）。サインインしていなければピンを描かないので出さない。
 * - 常駐するタブなので、フォーカスが戻るたびに現在地を静かに取り直す（初回除く。isLoading を立てない）。
 * - ピン詳細の「ピンの場所に移動」（`focus`。SS-246）は、地図がまだ無ければ最初の表示範囲にし（現在地の取得を待たない）、
 *   地図があれば `regionRequest` で動かす。`focus.key` ごとに1回だけ。
 */
export function PinTabView({ isSignedIn, onSignIn, focus = null }: PinTabViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { show } = toast;
  const [visibleRegion, setVisibleRegion] = useState<MapRegion | null>(null);
  const [regionRequest, setRegionRequest] = useState<MapRegionRequest | null>(null);
  const picker = usePinLocationPicker();

  // 地図の最初の表示範囲。ピン詳細から寄せる要求があればそこ、無ければ現在地起点（picker）。
  // 「一度だけ確定」はレンダー中の state 調整で行う（`usePinLocationPicker` と同じ。effect にすると1フレーム遅れる）。
  const [mapStartRegion, setMapStartRegion] = useState<MapRegion | null>(null);
  const [handledFocusKey, setHandledFocusKey] = useState<string | null>(null);
  if (focus !== null && focus.key !== handledFocusKey) {
    setHandledFocusKey(focus.key);
    const region = regionAroundPoint(focus.target);
    if (mapStartRegion === null) {
      setMapStartRegion(region);
    } else {
      setRegionRequest((previous) => ({ region, nonce: (previous?.nonce ?? 0) + 1 }));
    }
  } else if (mapStartRegion === null && picker.startRegion !== null) {
    setMapStartRegion(picker.startRegion);
  }
  const pinFilter = usePinMapFilterStore((state) => state.filter);
  const registered = useRegisteredPins({ visibleRegion, enabled: isSignedIn, filter: pinFilter });
  const notice = resolvePinMapNotice({
    isSignedIn,
    filtered: !isDefaultPinMapFilter(pinFilter),
    status: registered.status,
    errorCode: registered.errorCode,
    truncated: registered.truncated,
    pinCount: registered.pins.length,
  });

  // 画面から出る遷移の二重発火防止（フォーカスで解除するラッチ）。
  // `useScreenBack` は `hardwareBackPress` を購読して戻るを奪い、タブの Android バックの既定
  // （`backBehavior: firstRoute` でナビタブへ。ADR-M-009 SS-145 追補）を変えてしまうので使わず、
  // BackHandler を購読しない `useNavigateOnce` を使う。サインイン遷移（`onSignIn`）も同じラッチに通す。
  const { runOnce } = useNavigateOnce();
  const { refreshLocation } = picker;
  const handleSignIn = () => runOnce(onSignIn);

  // 初回フォーカス（マウント直後）は現在地を取得済みなので取り直さない。
  const hasFocusedRef = useRef(false);

  // フォーカス時: 現在地を取り直し（常駐するのでマウント時のままだと古くなる。初回除く）、
  // ピン登録（/pins/new）を保存して戻ってきたときの
  // 保存完了トーストを出す（画面またぎのメッセージ受け渡し。`src/lib/flashMessage.ts` 参照）。
  useFocusEffect(
    useCallback(() => {
      if (hasFocusedRef.current) refreshLocation();
      hasFocusedRef.current = true;
      const message = consumeFlashMessage();
      if (message) show(message);
    }, [show, refreshLocation]),
  );

  const handlePick = (location: GeoCoordinates) => {
    // push であって replace ではない（ADR-M-011 SS-146 追補）。clientWalkId は付けない。
    runOnce(() => router.push({ pathname: "/pins/new", params: buildPinNewRouteParams(location) }));
  };

  // `RegisteredPinMarkers` は `React.memo` なので参照を安定させる。
  const handleSelectPin = useCallback(
    (pinId: string) => {
      runOnce(() => router.push({ pathname: "/pins/[pinId]", params: { pinId } }));
    },
    [runOnce, router],
  );

  // クラスタのタップ: それが分かれる縮尺へ地図を動かす（SS-243）。`RegisteredPinMarkers` は memo なので参照を安定させる。
  const handleSelectCluster = useCallback((region: MapRegion) => {
    setRegionRequest((previous) => ({ region, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  const handleOpenSanpoMapList = () => {
    runOnce(() => router.push("/sanpo-maps"));
  };

  return (
    <View testID="pin-tab-screen" style={styles.root}>
      <View style={styles.mapArea}>
        <PinMapCanvas
          testIDPrefix="pin-tab"
          accessibilityLabel="ピンの地図"
          accessibilityHint={PIN_TAB_HINT}
          initialRegion={mapStartRegion}
          pickGesture="long-press"
          onPick={handlePick}
          selectedLocation={null}
          currentLocation={picker.currentLocation}
          focusRequest={picker.focusRequest}
          regionRequest={regionRequest}
          onRegionChangeComplete={setVisibleRegion}
          // 認証が無いときはピンのレイヤーを描かない（`enabled: false` でもキャッシュ済みのピンは返るため）。
          mapLayers={
            isSignedIn ? (
              <RegisteredPinMarkers
                pins={registered.pins}
                visibleRegion={visibleRegion}
                onSelectPin={handleSelectPin}
                onSelectCluster={handleSelectCluster}
                testIDPrefix="pin-tab-pin"
              />
            ) : null
          }
        />
        {/* box-none 必須: 付けないと地図の上半分の長押し・パンが効かなくなる。 */}
        <View
          pointerEvents="box-none"
          style={[styles.topOverlay, { top: insets.top + theme.spacing[2] }]}
        >
          <Card style={styles.infoCard} testID="pin-tab-info">
            <View style={styles.hintRow}>
              <Icon name="info" size={18} color={theme.colors.textTertiary} />
              <Text style={styles.hintText} testID="pin-tab-hint">
                {PIN_TAB_HINT}
              </Text>
            </View>
            <PinMapStatusNotice
              notice={notice}
              onSignIn={handleSignIn}
              onRetry={registered.retry}
              testIDPrefix="pin-tab"
            />
          </Card>
          {picker.locationErrorCode !== null ? (
            <LocationPermissionNotice
              errorCode={picker.locationErrorCode}
              context="map"
              onRetry={picker.retryLocation}
              testID="pin-tab-location-notice"
            />
          ) : null}
          {isSignedIn || picker.currentLocation ? (
            <View pointerEvents="box-none" style={styles.mapTools}>
              {isSignedIn ? <PinMapFilterControl testIDPrefix="pin-tab-pin-filter" /> : null}
              {picker.currentLocation ? (
                <IconButton
                  icon="crosshair"
                  label="現在地"
                  variant="surface"
                  size="sm"
                  onPress={picker.recenter}
                  testID="pin-tab-recenter"
                />
              ) : null}
            </View>
          ) : null}
        </View>
        {/* 地図エリアの下端はボタン配置エリアの上。タブ画面なので insets.bottom は足さない。 */}
        <ToastOverlay message={toast.message} visible={toast.visible} bottom={theme.spacing[4]} />
      </View>
      <TabActionBar testID="pin-tab-action-bar">
        <Button
          variant="secondary"
          size="sm"
          icon="map"
          onPress={handleOpenSanpoMapList}
          testID="pin-tab-open-sanpo-map-list"
        >
          地図一覧
        </Button>
      </TabActionBar>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
  mapArea: {
    flex: 1,
  },
  topOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    gap: theme.spacing[2],
  },
  infoCard: {
    marginHorizontal: theme.layout.pageGutter,
    gap: theme.spacing[2],
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  hintText: {
    flex: 1,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  mapTools: {
    alignSelf: "flex-end",
    paddingRight: theme.layout.pageGutter,
    gap: theme.spacing[2],
  },
}));
