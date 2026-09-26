import { useRouter } from "expo-router";
import { useCallback } from "react";

import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";
import { RegisteredPinsMapLayer } from "@/features/pin/components/RegisteredPinsMapLayer";
import { WalkActiveView } from "@/features/walk/components/WalkActiveView";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { MapRegion } from "@/lib/mapRegion";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 散歩中（ナビタブ）。`features/walk` は `features/pin` を import しない規約を保つため、
 * 登録済みピンのレイヤー（`RegisteredPinsMapLayer`）の合成と認証値・フラグの注入はこのルートが担う
 * （SS-118。`docs/architecture-guideline.md`「認証の扱い」）。
 */
export default function WalkActiveRoute() {
  const router = useRouter();
  const pinFeatureEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.pinRegistration);
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");

  const handleSelectPin = useCallback(
    (pinId: string) => router.push({ pathname: "/pins/[pinId]", params: { pinId } }),
    [router],
  );

  const renderMapLayers = useCallback(
    (visibleRegion: MapRegion | null) => (
      <RegisteredPinsMapLayer
        visibleRegion={visibleRegion}
        enabled={pinFeatureEnabled && isSignedIn}
        onSelectPin={handleSelectPin}
        testIDPrefix="walk-active-pin"
      />
    ),
    [pinFeatureEnabled, isSignedIn, handleSelectPin],
  );

  return <WalkActiveView renderMapLayers={renderMapLayers} />;
}
