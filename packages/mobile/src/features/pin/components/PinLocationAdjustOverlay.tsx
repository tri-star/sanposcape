import { useEffect, useState } from "react";
import { Keyboard, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { PinMapFullScreen } from "@/features/pin/components/PinMapFullScreen";
import { regionAroundPoint } from "@/features/pin/lib/pinLocationPicker";
import type { GeoCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";

export type PinLocationAdjustOverlayProps = {
  /** 開いた時点の位置（調整済みなら調整後）。 */
  initialLocation: GeoCoordinates;
  onCancel: () => void;
  onConfirm: (location: GeoCoordinates) => void;
};

/**
 * PinLocationAdjustOverlay — (a) 登録画面の上に重ねる全画面の位置調整（SS-124 D7）。
 * RN の `Modal` も新しいルートも使わない全画面オーバーレイ（`position: absolute` の View）。
 * `PinRegisterView` が開いているときだけマウントするので、開くたびに `initialLocation` で
 * 初期化される。Android バックはこのコンポーネントでは扱わず、`PinRegisterView` の
 * `useScreenBack({ onIntercept })` が閉じる。
 */
export function PinLocationAdjustOverlay({
  initialLocation,
  onCancel,
  onConfirm,
}: PinLocationAdjustOverlayProps) {
  const styles = useStyles();
  const [draft, setDraft] = useState<GeoCoordinates>(initialLocation);

  // 名前やメモを入力中のキーボードを閉じてから地図を見せる。
  useEffect(() => {
    Keyboard.dismiss();
  }, []);

  return (
    <View style={styles.overlay} accessibilityViewIsModal testID="pin-location-adjust-overlay">
      <PinMapFullScreen
        testIDPrefix="pin-location-adjust"
        title="ピンの位置を調整"
        hint="地図をタップすると、その場所にピンが移動します"
        initialRegion={regionAroundPoint(initialLocation)}
        pickGesture="tap"
        onPick={setDraft}
        selectedLocation={draft}
        currentLocation={null}
        focusRequest={null}
        closeKind="close"
        onClose={onCancel}
        footerActions={
          <Button
            variant="primary"
            icon="check"
            fullWidth
            onPress={() => onConfirm(draft)}
            testID="pin-location-adjust-confirm"
          >
            この位置にする
          </Button>
        }
      />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
    elevation: 10,
  },
}));
