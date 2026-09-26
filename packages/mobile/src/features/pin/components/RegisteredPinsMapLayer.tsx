import type { ReactNode } from "react";

import { RegisteredPinMarkers } from "@/features/pin/components/RegisteredPinMarkers";
import { useRegisteredPins } from "@/features/pin/hooks/useRegisteredPins";
import type { MapRegion } from "@/lib/mapRegion";

export type RegisteredPinsMapLayerProps = {
  visibleRegion: MapRegion | null;
  enabled: boolean;
  onSelectPin: (pinId: string) => void;
  testIDPrefix: string;
};

/**
 * RegisteredPinsMapLayer — 散歩中の地図（`features/walk`）へ `app/` のルートから合成するための
 * 「hook + Markers」（SS-118）。`features/walk` は `features/pin` を import しない規約
 * （`docs/architecture-guideline.md`）を保つため、合成自体はルート
 * （`app/(tabs)/index.tsx`）が `WalkActiveView.renderMapLayers` 経由で行う。
 *
 * 取得失敗・打ち切りは表示しない（散歩中の画面は下部カードで埋まっており、ピンは付加情報の
 * ため静かに劣化させる。案内が要る画面は `/pins/map`（`PinMapView`）側で出す）。
 */
export function RegisteredPinsMapLayer({
  visibleRegion,
  enabled,
  onSelectPin,
  testIDPrefix,
}: RegisteredPinsMapLayerProps): ReactNode {
  const { pins } = useRegisteredPins({ visibleRegion, enabled });
  return <RegisteredPinMarkers pins={pins} onSelectPin={onSelectPin} testIDPrefix={testIDPrefix} />;
}
