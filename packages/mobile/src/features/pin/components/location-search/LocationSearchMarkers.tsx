import { memo } from "react";
import { Marker } from "react-native-maps";

import { MapPin } from "@/components/ui/map-pin/MapPin";
import { mapPinMarkerPlacement } from "@/components/ui/map-pin/mapPinGeometry";
import type { LocationSearchResult } from "@/features/pin/lib/location-search/locationSearch";

const RESULT_PIN_SIZE = 32;
const SELECTED_RESULT_PIN_SIZE = 40;
const RESULT_PIN_PLACEMENT = mapPinMarkerPlacement(RESULT_PIN_SIZE);
const SELECTED_RESULT_PIN_PLACEMENT = mapPinMarkerPlacement(SELECTED_RESULT_PIN_SIZE);
/** 登録済みピン（既定 0）より上、選択位置・現在地（1・2。`PinMapCanvas`）と同じ層に描く。選んだ結果はさらに上。 */
const RESULT_Z_INDEX = 1;
const SELECTED_RESULT_Z_INDEX = 3;

export type LocationSearchMarkersProps = {
  results: readonly LocationSearchResult[];
  selectedId: string | null;
  /** 必須（押せるのに何も起きないマーカーを作らない）。 */
  onSelect: (id: string) => void;
  /** 各 Marker に `${testIDPrefix}-${index}` を付ける（Google の place ID は testID に使わない）。 */
  testIDPrefix: string;
};

/**
 * LocationSearchMarkers — ピンタブの検索結果のピン（SS-267。ADR-M-026）。`MapView` の子を返すラッパ（`View` で包まない）。
 * 登録済みピン（地図のアイコン）と見分けるため、虫眼鏡のアイコンの `MapPin` で描く。タップで概要のカードを出す（呼び出し側）。
 * Google Places の内容なので、Google の地図のときだけ描く（呼び出し側。`currentMapRenderer()`）。
 */
export const LocationSearchMarkers = memo(function LocationSearchMarkers({
  results,
  selectedId,
  onSelect,
  testIDPrefix,
}: LocationSearchMarkersProps) {
  return (
    <>
      {results.map((result, index) => {
        const selected = result.id === selectedId;
        return (
          // tracksViewChanges={false} では子の変化が反映されないので、選択状態を key に含めて作り直す。
          <Marker
            key={`${result.id}:${selected}`}
            coordinate={result.location}
            accessibilityLabel={`検索結果: ${result.name}`}
            onPress={() => onSelect(result.id)}
            tracksViewChanges={false}
            zIndex={selected ? SELECTED_RESULT_Z_INDEX : RESULT_Z_INDEX}
            {...(selected ? SELECTED_RESULT_PIN_PLACEMENT : RESULT_PIN_PLACEMENT)}
            testID={`${testIDPrefix}-${index}`}
          >
            <MapPin
              category={selected ? "goal" : "sky"}
              icon="search"
              size={selected ? SELECTED_RESULT_PIN_SIZE : RESULT_PIN_SIZE}
            />
          </Marker>
        );
      })}
    </>
  );
});
