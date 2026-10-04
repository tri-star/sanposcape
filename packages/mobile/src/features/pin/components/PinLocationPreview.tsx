import { View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { MapPin } from "@/components/ui/map-pin/MapPin";
import { mapPinMarkerPlacement } from "@/components/ui/map-pin/mapPinGeometry";
import { DEFAULT_SANPO_MAP_ICON, sanpoMapPinAppearance } from "@/features/pin/lib/sanpoMapIcon";
import type { SanpoMapIconKey } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";
import type { GeoCoordinates } from "@/services/location/types";

/** 地図の表示範囲（緯度経度の差）。プレビューの表示範囲。位置の調整は全画面の `PinLocationAdjustOverlay` で行う（SS-124）。 */
const REGION_DELTA = 0.004;
const PREVIEW_HEIGHT = 140;
const PREVIEW_PIN_SIZE = 34;

export type PinLocationPreviewProps = {
  location: GeoCoordinates;
  /**
   * true のあいだは MapView を外し、同じ大きさの枠だけを残す。
   * Android ではネイティブの地図サーフェスどうしの重なり順が RN の View の順序に従わず、
   * 上に重ねた全画面地図（`PinLocationAdjustOverlay`）をこのプレビューが突き抜けて描画されるため（SS-124）。
   */
  mapHidden?: boolean;
  /** 読み上げラベルの上書き（既定「ピンを置く位置の地図」。詳細画面は「ピンの位置の地図」を渡す。SS-118）。 */
  accessibilityLabel?: string;
  /** ピンの見た目（保存先・所属の地図のアイコン）。既定は pin。 */
  markerIcon?: SanpoMapIconKey;
  testID?: string;
};

/** PinLocationPreview — ピンを置く位置の小さな地図プレビュー（操作不可。調整は PinLocationField の「位置を調整」から）。 */
export function PinLocationPreview({
  location,
  mapHidden = false,
  accessibilityLabel = "ピンを置く位置の地図",
  markerIcon = DEFAULT_SANPO_MAP_ICON,
  testID,
}: PinLocationPreviewProps) {
  const styles = useStyles();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
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
          <Marker
            // tracksViewChanges={false} では子の変化が反映されないので、アイコンが変わったら作り直す。
            key={markerIcon}
            coordinate={location}
            tracksViewChanges={false}
            {...mapPinMarkerPlacement(PREVIEW_PIN_SIZE)}
          >
            <MapPin {...sanpoMapPinAppearance(markerIcon)} size={PREVIEW_PIN_SIZE} />
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
