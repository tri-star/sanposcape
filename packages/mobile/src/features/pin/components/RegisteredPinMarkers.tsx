import { memo } from "react";
import { Marker } from "react-native-maps";

import { MapPin } from "@/components/ui/map-pin/MapPin";
import { mapPinMarkerPlacement } from "@/components/ui/map-pin/mapPinGeometry";
import { pinDisplayName } from "@/features/pin/lib/pinDetailState";
import { sanpoMapPinAppearance } from "@/features/pin/lib/sanpoMapIcon";
import type { RegisteredPin } from "@/features/pin/types";

const REGISTERED_PIN_SIZE = 30;

export type RegisteredPinMarkersProps = {
  pins: readonly RegisteredPin[];
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
 * ユーザー追加要件）。ピンが属する地図のアイコンで描く
 * （SS-172。`sanpoMapPinAppearance`）。登録画面のプレビュー・位置調整も選択中の地図のアイコンで描く。
 * `tracksViewChanges={false}` だと子 View の変化がネイティブに反映されないので、key にアイコンを含めて
 * アイコンが変わったら Marker を作り直す。`title` の代わりに `accessibilityLabel`
 * （`"<表示名>の詳細を開く"`。名前が無ければ `pinDisplayName` が「名前のないピン」を返す）を
 * 付け、スクリーンリーダーでも何のマーカーかが分かるようにする（SS-118 ローカルレビュー QA-S1。
 * ただしジェスチャー操作自体の代替導線は無い。ADR-M-012 の既知の限界を参照）。
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
          key={`${pin.id}:${pin.sanpoMapIcon}`}
          identifier={pin.id}
          coordinate={pin.location}
          {...mapPinMarkerPlacement(REGISTERED_PIN_SIZE)}
          tracksViewChanges={false}
          onPress={() => onSelectPin(pin.id)}
          testID={`${testIDPrefix}-${pin.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${pinDisplayName(pin.name)}の詳細を開く`}
        >
          <MapPin {...sanpoMapPinAppearance(pin.sanpoMapIcon)} size={REGISTERED_PIN_SIZE} />
        </Marker>
      ))}
    </>
  );
});
