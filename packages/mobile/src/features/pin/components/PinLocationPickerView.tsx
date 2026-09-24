import { useRouter } from "expo-router";

import { LocationPermissionNotice } from "@/components/location/LocationPermissionNotice";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { PinMapFullScreen } from "@/features/pin/components/PinMapFullScreen";
import { usePinLocationPicker } from "@/features/pin/hooks/usePinLocationPicker";
import { buildPinNewRouteParams } from "@/features/pin/lib/pinLocationPicker";
import { useScreenBack } from "@/hooks/useScreenBack";
import type { GeoCoordinates } from "@/services/location/types";

/**
 * PinLocationPickerView — (b) ピンの地点選択画面（`/pins/pick-location`）の実体。
 * ナビタブで散歩していないときの FAB から開く。長押しした地点で `/pins/new` へ `replace` する
 * （`push` だと保存後の `router.back()` がこの画面に戻ってしまうため。SS-124 D6）。
 */
export function PinLocationPickerView() {
  const picker = usePinLocationPicker();
  const router = useRouter();
  const back = useScreenBack({ fallbackHref: "/(tabs)" });

  const handlePick = (location: GeoCoordinates) => {
    back.runOnce(() =>
      router.replace({ pathname: "/pins/new", params: buildPinNewRouteParams(location) }),
    );
  };

  return (
    <PinMapFullScreen
      testIDPrefix="pin-location-picker"
      title="ピンを置く場所を選ぶ"
      hint="地図を長押しすると、その場所にピンを登録できます"
      initialRegion={picker.startRegion}
      pickGesture="long-press"
      onPick={handlePick}
      selectedLocation={null}
      currentLocation={picker.currentLocation}
      focusRequest={picker.focusRequest}
      closeKind="back"
      onClose={back.goBack}
      mapTools={
        picker.currentLocation ? (
          <IconButton
            icon="crosshair"
            label="現在地"
            variant="surface"
            size="sm"
            onPress={picker.recenter}
            testID="pin-location-picker-recenter"
          />
        ) : null
      }
      notice={
        picker.locationErrorCode !== null ? (
          <LocationPermissionNotice
            errorCode={picker.locationErrorCode}
            onRetry={picker.retryLocation}
            testID="pin-location-picker-location-notice"
          />
        ) : null
      }
    />
  );
}
