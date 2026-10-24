import { memo } from "react";
import { Marker } from "react-native-maps";

import { mapPinMarkerPlacement } from "@/components/ui/map-pin/mapPinGeometry";
import { SanpoMapPin } from "@/features/pin/components/SanpoMapPin";
import {
  ARCHIVED_PIN_MARKER_OPACITY,
  registeredPinMarkerAccessibilityLabel,
} from "@/features/pin/lib/pinStatus";
import type { RegisteredPin } from "@/features/pin/types";

/** 頭にカラーの画像を載せるので、従来の 30 より大きくする（SS-191）。 */
const REGISTERED_PIN_SIZE = 38;
/** サイズ固定なので基準点はモジュール定数（pins.map の中で毎回新しいオブジェクトを Marker に渡さない）。 */
const REGISTERED_PIN_PLACEMENT = mapPinMarkerPlacement(REGISTERED_PIN_SIZE);

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
 * （SS-172。`SanpoMapPin`。SS-191 でカラーの画像に）。登録画面のプレビュー・位置調整も選択中の地図のアイコンで描く。
 * `tracksViewChanges={false}` だと子 View の変化がネイティブに反映されないので、key にアイコンを含めて
 * アイコンが変わったら Marker を作り直す。`title` の代わりに `accessibilityLabel`
 * （`"<表示名>の詳細を開く"`。名前が無ければ `pinDisplayName` が「名前のないピン」を返す）を
 * 付け、スクリーンリーダーでも何のマーカーかが分かるようにする（SS-118 ローカルレビュー QA-S1。
 * ただしジェスチャー操作自体の代替導線は無い。ADR-M-012 の既知の限界を参照）。
 *
 * アーカイブ済みのピン（地図の絞り込みで「アーカイブ済みも表示」にしたときだけ来る）は `Marker` の
 * `opacity` で半透明にし、読み上げにも状態を入れる（SS-174）。`opacity` は子 View ではなく Marker 自身の
 * プロパティだが、状態が変わったときに確実に作り直すよう key にも含める。
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
          key={`${pin.id}:${pin.sanpoMapIcon}:${pin.archived}`}
          identifier={pin.id}
          coordinate={pin.location}
          {...REGISTERED_PIN_PLACEMENT}
          tracksViewChanges={false}
          opacity={pin.archived ? ARCHIVED_PIN_MARKER_OPACITY : 1}
          onPress={() => onSelectPin(pin.id)}
          testID={`${testIDPrefix}-${pin.id}`}
          accessibilityRole="button"
          accessibilityLabel={registeredPinMarkerAccessibilityLabel(pin)}
        >
          <SanpoMapPin icon={pin.sanpoMapIcon} size={REGISTERED_PIN_SIZE} />
        </Marker>
      ))}
    </>
  );
});
