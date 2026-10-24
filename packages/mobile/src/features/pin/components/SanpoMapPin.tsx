import { MapPin } from "@/components/ui/map-pin/MapPin";
import { SanpoMapIconArt } from "@/features/pin/components/SanpoMapIconArt";
import { SANPO_MAP_ICON_META } from "@/features/pin/lib/sanpoMapIcon";
import type { SanpoMapIconKey } from "@/features/pin/types";

export type SanpoMapPinProps = {
  icon: SanpoMapIconKey;
  /** 頭の直径（px）。`Marker` には同じ値の `mapPinMarkerPlacement(size)` を spread する。 */
  size: number;
};

/**
 * SanpoMapPin — 地図のアイコンで描くピン（ピンの色はアイコンの系統色、頭にカラーの画像。SS-172 / SS-191）。
 * 登録済みピン・ピン詳細と登録画面のプレビュー・位置調整の選択ピンで使う。
 */
export function SanpoMapPin({ icon, size }: SanpoMapPinProps) {
  return (
    <MapPin
      category={SANPO_MAP_ICON_META[icon].tone}
      art={<SanpoMapIconArt icon={icon} />}
      size={size}
    />
  );
}
