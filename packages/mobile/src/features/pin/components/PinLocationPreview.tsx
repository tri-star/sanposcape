import { View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { MapPin } from "@/components/ui/map-pin/MapPin";
import { makeStyles } from "@/theme/makeStyles";
import type { GeoCoordinates } from "@/services/location/types";

/** 地図の表示範囲（緯度経度の差）。位置の微調整は MVP ではしない固定値。 */
const REGION_DELTA = 0.004;
const PREVIEW_HEIGHT = 140;

export type PinLocationPreviewProps = {
  location: GeoCoordinates;
  testID?: string;
};

/** PinLocationPreview — ピンを置く現在地の小さな地図プレビュー（操作不可）。 */
export function PinLocationPreview({ location, testID }: PinLocationPreviewProps) {
  const styles = useStyles();

  return (
    <View accessibilityLabel="ピンを置く位置の地図" style={styles.wrap}>
      <MapView
        testID={testID}
        style={styles.map}
        initialRegion={{
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
