import { memo, useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { Marker } from "react-native-maps";

import { mapPinMarkerPlacement } from "@/components/ui/map-pin/mapPinGeometry";
import { PinClusterMarker } from "@/features/pin/components/PinClusterMarker";
import { SanpoMapPin } from "@/features/pin/components/SanpoMapPin";
import {
  clusterExpansionRegion,
  createPinClusterIndex,
  resolvePinMapItems,
  type PinMapItem,
} from "@/features/pin/lib/pinClusters";
import {
  ARCHIVED_PIN_MARKER_OPACITY,
  registeredPinMarkerAccessibilityLabel,
} from "@/features/pin/lib/pinStatus";
import type { RegisteredPin } from "@/features/pin/types";
import type { MapRegion } from "@/lib/mapRegion";

/** 頭にカラーの画像を載せるので、従来の 30 より大きくする（SS-191）。 */
const REGISTERED_PIN_SIZE = 38;
/** サイズ固定なので基準点はモジュール定数（pins.map の中で毎回新しいオブジェクトを Marker に渡さない）。 */
const REGISTERED_PIN_PLACEMENT = mapPinMarkerPlacement(REGISTERED_PIN_SIZE);

export type RegisteredPinMarkersProps = {
  pins: readonly RegisteredPin[];
  /** 今の表示範囲（まとめる縮尺と範囲を決める）。null の間は何も描かない。 */
  visibleRegion: MapRegion | null;
  /** 必須（押せるのに何も起きないマーカーを作らない）。 */
  onSelectPin: (pinId: string) => void;
  /** クラスタのタップで移る表示範囲を渡す。地図を動かすのは呼び出し側（地図の ref を持つ側）。 */
  onSelectCluster: (region: MapRegion) => void;
  /** 各 Marker に `${testIDPrefix}-${pin.id}`、クラスタに `${testIDPrefix}-cluster-${clusterId}` を付ける。 */
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
 * 表示範囲に応じて近いピンを件数入りの円（`PinClusterBubble`）にまとめる（SS-243。ADR-M-012 D3 の SS-243 追補）。
 * まとめの計算は `lib/pinClusters.ts`（supercluster）。index はピンの配列が変わったときだけ作り直し、
 * 表示範囲が変わるたびに描く要素を求め直す。クラスタのタップでは、それが分かれる縮尺の表示範囲を `onSelectCluster` に渡す。
 * クラスタ（`PinClusterMarker`）は件数を key に入れ、件数が変わったら作り直す。
 * 地図の幅は画面の幅で代える（ピンタブ・散歩中の地図とも画面の幅いっぱい）。
 *
 * `React.memo` で包み、`pins`・`visibleRegion` の参照が変わらない限り再レンダーしない
 * （`WalkActiveView` は経過時間で毎秒再レンダーされるため）。
 */
export const RegisteredPinMarkers = memo(function RegisteredPinMarkers({
  pins,
  visibleRegion,
  onSelectPin,
  onSelectCluster,
  testIDPrefix,
}: RegisteredPinMarkersProps) {
  const { width: mapWidthDp } = useWindowDimensions();
  const clusterIndex = useMemo(() => createPinClusterIndex(pins), [pins]);
  const items = useMemo<PinMapItem[]>(
    () =>
      visibleRegion === null ? [] : resolvePinMapItems(clusterIndex, visibleRegion, mapWidthDp),
    [clusterIndex, visibleRegion, mapWidthDp],
  );

  return (
    <>
      {items.map((item) => {
        if (item.kind === "cluster") {
          return (
            <PinClusterMarker
              key={`cluster:${item.clusterId}:${item.count}`}
              coordinate={item.coordinate}
              count={item.count}
              onPress={() => {
                if (visibleRegion === null) return;
                onSelectCluster(
                  clusterExpansionRegion(clusterIndex, item, visibleRegion, mapWidthDp),
                );
              }}
              testID={`${testIDPrefix}-cluster-${item.clusterId}`}
            />
          );
        }
        const { pin } = item;
        return (
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
        );
      })}
    </>
  );
});
