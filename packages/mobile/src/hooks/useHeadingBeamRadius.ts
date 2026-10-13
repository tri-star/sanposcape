import { useCallback, useState } from "react";
import type { LayoutChangeEvent } from "react-native";

import { headingBeamRadiusMeters } from "@/components/ui/heading-beam/headingBeamGeometry";
import type { MapRegion } from "@/lib/mapRegion";

export type UseHeadingBeamRadiusResult = {
  /** 扇形の半径（m）。地図の高さか表示範囲がまだ分からなければ null。 */
  radiusMeters: number | null;
  /** 地図を包む View の `onLayout` に渡す。 */
  onMapLayout: (event: LayoutChangeEvent) => void;
  /** 表示範囲が確定したとき（初回表示 + パン・ズーム後）に呼ぶ。 */
  onMapRegion: (region: MapRegion) => void;
};

/**
 * 向きの扇形（`HeadingBeam`）を画面上でおおよそ一定の大きさに見せるための半径（m）を求める hook（SS-169）。
 * 地図の高さ（px）と表示範囲の緯度方向の幅から 1px あたりの距離を見積もる。
 * ピンチの最中は図形が地図と一緒に拡大縮小し、ズームが確定したときに大きさが戻る。
 */
export function useHeadingBeamRadius(): UseHeadingBeamRadiusResult {
  const [mapHeightPx, setMapHeightPx] = useState(0);
  const [latitudeDelta, setLatitudeDelta] = useState<number | null>(null);

  const onMapLayout = useCallback((event: LayoutChangeEvent) => {
    setMapHeightPx(event.nativeEvent.layout.height);
  }, []);
  const onMapRegion = useCallback((region: MapRegion) => {
    setLatitudeDelta(region.latitudeDelta);
  }, []);

  return {
    radiusMeters:
      latitudeDelta === null ? null : headingBeamRadiusMeters({ latitudeDelta, mapHeightPx }),
    onMapLayout,
    onMapRegion,
  };
}
