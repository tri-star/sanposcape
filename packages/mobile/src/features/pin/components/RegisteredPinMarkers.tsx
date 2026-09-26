import { memo } from "react";
import { Marker } from "react-native-maps";

import { MapPin } from "@/components/ui/map-pin/MapPin";
import type { PinSummary } from "@/features/pin/types";

export type RegisteredPinMarkersProps = {
  pins: readonly PinSummary[];
  /** 必須（押せるのに何も起きないマーカーを作らない）。 */
  onSelectPin: (pinId: string) => void;
  /** 各 Marker に `${testIDPrefix}-${pin.id}` を付ける。 */
  testIDPrefix: string;
};

/**
 * RegisteredPinMarkers — `MapView` の子として登録済みピンの `Marker` を描く表示専用コンポーネント
 * （SS-118。`WalkRoutePolylines` と同じ「MapView の子を返すラッパ」。`View` で包まない）。
 *
 * `title` を付けない（Marker の吹き出しを出さず、タップで直接ピン詳細へ進むため。
 * ユーザー追加要件）。見た目は登録画面のプレビュー・地点選択の選択マーカーと揃える
 * （`MapPin category="park" icon="map-pin"`）。
 *
 * `React.memo` で包み、`pins` の参照が変わらない限り再レンダーしない
 * （`WalkActiveView` は経過時間で毎秒再レンダーされるため）。
 */
export const RegisteredPinMarkers = memo(function RegisteredPinMarkers({
  pins,
  onSelectPin,
  testIDPrefix,
}: RegisteredPinMarkersProps) {
  return (
    <>
      {pins.map((pin) => (
        <Marker
          key={pin.id}
          identifier={pin.id}
          coordinate={pin.location}
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={false}
          onPress={() => onSelectPin(pin.id)}
          testID={`${testIDPrefix}-${pin.id}`}
        >
          <MapPin category="park" icon="map-pin" size={30} />
        </Marker>
      ))}
    </>
  );
});
