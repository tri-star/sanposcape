import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { LocationPermissionNotice } from "@/components/location/LocationPermissionNotice";
import { Button } from "@/components/ui/button/Button";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { PinMapFullScreen } from "@/features/pin/components/PinMapFullScreen";
import { RegisteredPinMarkers } from "@/features/pin/components/RegisteredPinMarkers";
import { usePinLocationPicker } from "@/features/pin/hooks/usePinLocationPicker";
import { useRegisteredPins } from "@/features/pin/hooks/useRegisteredPins";
import { resolvePinMapNotice, type PinMapNotice } from "@/features/pin/lib/pinMapNotice";
import { pinReadErrorMessage } from "@/features/pin/lib/pinReadError";
import { useScreenBack } from "@/hooks/useScreenBack";
import type { MapRegion } from "@/lib/mapRegion";
import { makeStyles } from "@/theme/makeStyles";

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
 */
export function PinMapView({ isSignedIn, onSignIn }: PinMapViewProps) {
  const picker = usePinLocationPicker();
  const router = useRouter();
  const back = useScreenBack({ fallbackHref: "/(tabs)" });
  const [visibleRegion, setVisibleRegion] = useState<MapRegion | null>(null);

  // フラグ（pin_registration）はルートの画面ガードで確定済みなので、ここでは isSignedIn だけ見ればよい。
  const registered = useRegisteredPins({ visibleRegion, enabled: isSignedIn });

  const handleSelectPin = (pinId: string) => {
    back.runOnce(() => router.push({ pathname: "/pins/[pinId]", params: { pinId } }));
  };

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
        <PinMapStatus notice={notice} onSignIn={onSignIn} onRetry={registered.retry} />
      }
    />
  );
}

type PinMapStatusProps = {
  notice: PinMapNotice;
  onSignIn: () => void;
  onRetry: () => void;
};

function PinMapStatus({ notice, onSignIn, onRetry }: PinMapStatusProps) {
  const styles = useStyles();

  switch (notice.kind) {
    case "sign-in":
      return (
        <View style={styles.row} testID="pin-map-sign-in">
          <Text style={styles.text}>サインインすると、登録したピンが地図に表示されます</Text>
          <Button variant="primary" size="sm" onPress={onSignIn}>
            サインイン
          </Button>
        </View>
      );
    case "loading":
      return (
        <View style={styles.row} testID="pin-map-pins-loading">
          <ActivityIndicator />
          <Text style={styles.text}>ピンを読み込んでいます…</Text>
        </View>
      );
    case "error":
      return (
        <View style={styles.row} testID="pin-map-pins-error">
          <Text style={styles.text}>{pinReadErrorMessage(notice.code)}</Text>
          {notice.retriable ? (
            <Button variant="secondary" size="sm" onPress={onRetry} testID="pin-map-pins-retry">
              再試行
            </Button>
          ) : null}
        </View>
      );
    case "truncated":
      return (
        <Text style={styles.textSecondary} testID="pin-map-pins-truncated">
          ピンが多いため、新しいものから一部だけを表示しています。地図を拡大すると、ほかのピンも表示されます
        </Text>
      );
    case "empty":
      return (
        <Text style={styles.text} testID="pin-map-pins-empty">
          この範囲に登録したピンはありません
        </Text>
      );
    case "none":
      return null;
    default: {
      const exhaustiveCheck: never = notice;
      return exhaustiveCheck;
    }
  }
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  text: {
    flex: 1,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  textSecondary: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
}));
