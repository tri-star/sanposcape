import type { ReactNode } from "react";

import { RegisteredPinMarkers } from "@/features/pin/components/RegisteredPinMarkers";
import { useRegisteredPins } from "@/features/pin/hooks/useRegisteredPins";
import type { MapRegion } from "@/lib/mapRegion";

export type RegisteredPinsMapLayerProps = {
  visibleRegion: MapRegion | null;
  onSelectPin: (pinId: string) => void;
  testIDPrefix: string;
};

/**
 * RegisteredPinsMapLayer — 散歩中の地図（`features/walk`）へ `app/` のルートから合成するための
 * 「hook + Markers」（SS-118）。`features/walk` は `features/pin` を import しない規約
 * （`docs/architecture-guideline.md`）を保つため、合成自体はルート
 * （`app/(tabs)/index.tsx`）が `WalkActiveView.renderMapLayers` 経由で行う。
 *
 * フラグ OFF・未サインインのときは、ルートがこのコンポーネント自体を描かない（`enabled: false` の
 * query でもキャッシュ済みのピンは返るため、`enabled` を渡して隠す方式にはしない）。
 *
 * 取得失敗・打ち切りは表示しない（散歩中の画面は下部カードで埋まっており、ピンは付加情報の
 * ため静かに劣化させる。案内が要る画面は `/pins/map`（`PinMapView`）とピンタブ（`PinTabView`）で出す。
 * どちらもこの包みではなく `useRegisteredPins` + `RegisteredPinMarkers` を直接使う）。
 */
export function RegisteredPinsMapLayer({
  visibleRegion,
  onSelectPin,
  testIDPrefix,
}: RegisteredPinsMapLayerProps): ReactNode {
  const { pins } = useRegisteredPins({ visibleRegion, enabled: true });
  return <RegisteredPinMarkers pins={pins} onSelectPin={onSelectPin} testIDPrefix={testIDPrefix} />;
}
