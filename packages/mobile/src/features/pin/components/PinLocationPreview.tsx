import { View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { MapPin } from "@/components/ui/map-pin/MapPin";
import { makeStyles } from "@/theme/makeStyles";
import type { GeoCoordinates } from "@/services/location/types";

/** 地図の表示範囲（緯度経度の差）。プレビューの表示範囲。位置の調整は全画面の `PinLocationAdjustOverlay` で行う（SS-124）。 */
const REGION_DELTA = 0.004;
const PREVIEW_HEIGHT = 140;

export type PinLocationPreviewProps = {
  location: GeoCoordinates;
  /**
   * true のあいだは MapView を外し、同じ大きさの枠だけを残す。
   * Android ではネイティブの地図サーフェスどうしの重なり順が RN の View の順序に従わず、
   * 上に重ねた全画面地図（`PinLocationAdjustOverlay`）をこのプレビューが突き抜けて描画されるため（SS-124）。
   */
  mapHidden?: boolean;
  testID?: string;
};

/** PinLocationPreview — ピンを置く位置の小さな地図プレビュー（操作不可。調整は PinLocationField の「位置を調整」から）。 */
export function PinLocationPreview({
  location,
  mapHidden = false,
  testID,
}: PinLocationPreviewProps) {
  const styles = useStyles();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="ピンを置く位置の地図"
      style={styles.wrap}
    >
      {mapHidden ? null : (
        <MapView
          testID={testID}
          style={styles.map}
          region={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: REGION_DELTA,
            longitudeDelta: REGION_DELTA,
          }}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          showsUserLocation={false}
        >
          <Marker coordinate={location} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <MapPin category="park" icon="map-pin" size={34} />
          </Marker>
        </MapView>
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  wrap: {
    height: PREVIEW_HEIGHT,
    marginHorizontal: theme.layout.pageGutter,
    borderRadius: theme.radius.lg,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.borderSubtle,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
}));
