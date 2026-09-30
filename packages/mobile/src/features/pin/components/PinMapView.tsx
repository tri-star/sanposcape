import { useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { LocationPermissionNotice } from "@/components/location/LocationPermissionNotice";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { PinMapStatusNotice } from "@/features/pin/components/PinMapStatusNotice";
import { PinMapFullScreen } from "@/features/pin/components/PinMapFullScreen";
import { RegisteredPinMarkers } from "@/features/pin/components/RegisteredPinMarkers";
import { usePinLocationPicker } from "@/features/pin/hooks/usePinLocationPicker";
import { useRegisteredPins } from "@/features/pin/hooks/useRegisteredPins";
import { resolvePinMapNotice } from "@/features/pin/lib/pinMapNotice";
import { useScreenBack } from "@/hooks/useScreenBack";
import type { MapRegion } from "@/lib/mapRegion";

export type PinMapViewProps = {
  /** ルート（`app/pins/map.tsx`）が `useAuthSessionStore` から注入する。 */
  isSignedIn: boolean;
  onSignIn: () => void;
};

/**
 * PinMapView — `/pins/map`（登録済みピンの地図）の実体（SS-118）。
 * ナビタブで散歩していないときの「登録したピンを地図で見る」から push する。
 * 全画面の地図に表示範囲内の登録済みピンを描き、タップで `/pins/[pinId]` へ push する
 * （モックのポップアップカードは挟まない。ユーザー追加要件）。
 *
 * ナビタブ（idle）の旧導線。ピンタブ（SS-146）が同じ役割を持つ。
 * ナビタブの導線を削除する別課題でルートごと削除する。
 */
export function PinMapView({ isSignedIn, onSignIn }: PinMapViewProps) {
  const picker = usePinLocationPicker();
  const router = useRouter();
  const back = useScreenBack({ fallbackHref: "/(tabs)" });
  const [visibleRegion, setVisibleRegion] = useState<MapRegion | null>(null);

  // フラグ（pin_registration）はルートの画面ガードで確定済みなので、ここでは isSignedIn だけ見ればよい。
  const registered = useRegisteredPins({ visibleRegion, enabled: isSignedIn });

  // `RegisteredPinMarkers` は `React.memo` で包まれているため、`onSelectPin` の参照を
  // 安定させないと `pins` が変わらなくても再レンダーで memo が無効化される
  // （SS-118 ローカルレビュー QA-W3。`back`/`router` は参照が安定している）。
  const handleSelectPin = useCallback(
    (pinId: string) => {
      back.runOnce(() => router.push({ pathname: "/pins/[pinId]", params: { pinId } }));
    },
    [back, router],
  );

  const notice = resolvePinMapNotice({
    isSignedIn,
    status: registered.status,
    errorCode: registered.errorCode,
    truncated: registered.truncated,
    pinCount: registered.pins.length,
  });

  return (
    <PinMapFullScreen
      testIDPrefix="pin-map"
      title="登録したピン"
      hint="ピンをタップすると、詳細を表示します"
      initialRegion={picker.startRegion}
      loadingLabel="現在地を取得しています…"
      pickGesture="none"
      selectedLocation={null}
      currentLocation={picker.currentLocation}
      focusRequest={picker.focusRequest}
      closeKind="back"
      onClose={back.goBack}
      onRegionChangeComplete={setVisibleRegion}
      mapLayers={
        <RegisteredPinMarkers
          pins={registered.pins}
          onSelectPin={handleSelectPin}
          testIDPrefix="pin-map-pin"
        />
      }
      mapTools={
        picker.currentLocation ? (
          <IconButton
            icon="crosshair"
            label="現在地"
            variant="surface"
            size="sm"
            onPress={picker.recenter}
            testID="pin-map-recenter"
          />
        ) : null
      }
      notice={
        picker.locationErrorCode !== null ? (
          <LocationPermissionNotice
            errorCode={picker.locationErrorCode}
            onRetry={picker.retryLocation}
            testID="pin-map-location-notice"
          />
        ) : null
      }
      footerActions={
        <PinMapStatusNotice
          notice={notice}
          onSignIn={onSignIn}
          onRetry={registered.retry}
          testIDPrefix="pin-map"
        />
      }
    />
  );
}
