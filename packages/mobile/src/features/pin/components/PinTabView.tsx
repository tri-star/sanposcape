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
import { PinMapStatusNotice } from "@/features/pin/components/PinMapStatusNotice";
import { RegisteredPinMarkers } from "@/features/pin/components/RegisteredPinMarkers";
import { usePinLocationPicker } from "@/features/pin/hooks/usePinLocationPicker";
import { useRegisteredPins } from "@/features/pin/hooks/useRegisteredPins";
import { buildPinNewRouteParams } from "@/features/pin/lib/pinLocationPicker";
import { resolvePinMapNotice } from "@/features/pin/lib/pinMapNotice";
import { useNavigateOnce } from "@/hooks/useNavigateOnce";
import { useToast } from "@/hooks/useToast";
import { consumeFlashMessage } from "@/lib/flashMessage";
import type { MapRegion } from "@/lib/mapRegion";
import type { GeoCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type PinTabViewProps = {
  /** ルート（`app/(tabs)/pins.tsx`）が `useAuthSessionStore` から注入する（features/pin は認証を読まない。ADR-009 決定8）。 */
  isSignedIn: boolean;
  onSignIn: () => void;
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
 * - 常駐するタブなので、フォーカスが戻るたびに現在地を静かに取り直す（初回除く。isLoading を立てない）。
 */
export function PinTabView({ isSignedIn, onSignIn }: PinTabViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { show } = toast;
  const [visibleRegion, setVisibleRegion] = useState<MapRegion | null>(null);
  const picker = usePinLocationPicker();
  const registered = useRegisteredPins({ visibleRegion, enabled: isSignedIn });
  const notice = resolvePinMapNotice({
    isSignedIn,
    status: registered.status,
    errorCode: registered.errorCode,
    truncated: registered.truncated,
    pinCount: registered.pins.length,
  });

  // 画面から出る遷移の二重発火防止（フォーカスで解除するラッチ）。
  // `useScreenBack` は `hardwareBackPress` を購読して戻るを奪い、タブの Android バックの既定
  // （`backBehavior: firstRoute` でナビタブへ。ADR-009 SS-145 追補）を変えてしまうので使わず、
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
    // push であって replace ではない（ADR-011 SS-146 追補）。clientWalkId は付けない。
    runOnce(() => router.push({ pathname: "/pins/new", params: buildPinNewRouteParams(location) }));
  };

  // `RegisteredPinMarkers` は `React.memo` なので参照を安定させる。
  const handleSelectPin = useCallback(
    (pinId: string) => {
      runOnce(() => router.push({ pathname: "/pins/[pinId]", params: { pinId } }));
    },
    [runOnce, router],
  );

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
          initialRegion={picker.startRegion}
          pickGesture="long-press"
          onPick={handlePick}
          selectedLocation={null}
          currentLocation={picker.currentLocation}
          focusRequest={picker.focusRequest}
          onRegionChangeComplete={setVisibleRegion}
          // 認証が無いときはピンのレイヤーを描かない（`enabled: false` でもキャッシュ済みのピンは返るため）。
          mapLayers={
            isSignedIn ? (
              <RegisteredPinMarkers
                pins={registered.pins}
                onSelectPin={handleSelectPin}
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
              onRetry={picker.retryLocation}
              testID="pin-tab-location-notice"
            />
          ) : null}
          {picker.currentLocation ? (
            <View pointerEvents="box-none" style={styles.mapTools}>
              <IconButton
                icon="crosshair"
                label="現在地"
                variant="surface"
                size="sm"
                onPress={picker.recenter}
                testID="pin-tab-recenter"
              />
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
