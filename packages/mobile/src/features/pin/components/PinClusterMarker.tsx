import { useEffect, useState } from "react";
import { Marker } from "react-native-maps";

import { PinClusterBubble } from "@/features/pin/components/PinClusterBubble";
import { pinClusterAccessibilityLabel } from "@/features/pin/lib/pinClusters";
import type { GeoCoordinates } from "@/services/location/types";

/** クラスタの円は中心を座標に合わせる（Android の `anchor`。iOS の Apple Maps は既定で中心）。 */
const CLUSTER_ANCHOR = { x: 0.5, y: 0.5 };
/**
 * 描き始めてから `tracksViewChanges` を止めるまでの時間（ms）。Android は止めた時点の姿を画像にして使うので、
 * 最初から止めると文字と縁が描かれる前の姿（塗りの円だけ）で固定される（SS-243 でエミュレータで確認）。
 */
const TRACK_VIEW_CHANGES_MS = 500;

export type PinClusterMarkerProps = {
  coordinate: GeoCoordinates;
  count: number;
  onPress: () => void;
  testID: string;
};

/**
 * PinClusterMarker — ピンのまとまりの `Marker`（SS-243）。件数が変わったら呼び出し側が key で作り直す前提で、
 * 作られてから少しの間だけ `tracksViewChanges` を有効にし、その後は止める（ピンのマーカーと同じく、毎フレームの描き直しを避ける）。
 */
export function PinClusterMarker({ coordinate, count, onPress, testID }: PinClusterMarkerProps) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTracksViewChanges(false), TRACK_VIEW_CHANGES_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Marker
      coordinate={coordinate}
      anchor={CLUSTER_ANCHOR}
      tracksViewChanges={tracksViewChanges}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={pinClusterAccessibilityLabel(count)}
    >
      <PinClusterBubble count={count} />
    </Marker>
  );
}
