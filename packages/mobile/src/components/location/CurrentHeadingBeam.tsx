import { HeadingBeam } from "@/components/ui/heading-beam/HeadingBeam";
import { useDeviceHeading } from "@/hooks/useDeviceHeading";
import type { GeoCoordinates } from "@/services/location/types";

export type CurrentHeadingBeamProps = {
  /** 現在地。null の間は向きを購読しない。 */
  center: GeoCoordinates | null;
  /** 扇形の半径（m。`useHeadingBeamRadius`）。null の間は向きを購読しない。 */
  radiusMeters: number | null;
  zIndex?: number;
};

/**
 * 現在地の向き（端末の方位）を扇形で描く（SS-169）。`MapView` の子としてのみ使う。
 * 方位の購読をこのコンポーネントに閉じ、向きが変わっても地図全体を再描画しない。
 * 方位が取れない（センサーが無い・開始に失敗した）ときは何も描かない。
 */
export function CurrentHeadingBeam({ center, radiusMeters, zIndex }: CurrentHeadingBeamProps) {
  const heading = useDeviceHeading(center !== null && radiusMeters !== null);
  if (center === null || radiusMeters === null || heading === null) return null;
  return (
    <HeadingBeam
      center={center}
      headingDegrees={heading}
      radiusMeters={radiusMeters}
      zIndex={zIndex}
    />
  );
}
