import { useRouter } from "expo-router";
import { useCallback } from "react";

import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";
import { RecentWalksSection } from "@/features/history/components/RecentWalksSection";
import { RegisteredPinsMapLayer } from "@/features/pin/components/RegisteredPinsMapLayer";
import { WalkActiveView } from "@/features/walk/components/WalkActiveView";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { MapRegion } from "@/lib/mapRegion";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 散歩中（ナビタブ）。`features/walk` は `features/pin` を import しない規約を保つため、
 * 登録済みピンのレイヤー（`RegisteredPinsMapLayer`）の合成と認証値・フラグの注入はこのルートが担う
 * （SS-118。`docs/architecture-guideline.md`「認証の扱い」）。
 * `features/walk` は `features/history` も import しないため、散歩していないときの
 * 「最近の散歩」（`RecentWalksSection`）もこのルートが合成して `idleSection` に渡す（SS-147）。
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

  // フラグ OFF・未サインインのときはレイヤー自体を描かない。`enabled: false` の query は通信を
  // 止めるだけで、キャッシュ済みのピンは返し続けるため（実行中にフラグが OFF になってもマーカーが
  // 残ってしまう。PR #105 レビュー）。
  const showRegisteredPins = pinFeatureEnabled && isSignedIn;
  const renderMapLayers = useCallback(
    (visibleRegion: MapRegion | null) =>
      showRegisteredPins ? (
        <RegisteredPinsMapLayer
          visibleRegion={visibleRegion}
          onSelectPin={handleSelectPin}
          testIDPrefix="walk-active-pin"
        />
      ) : null,
    [showRegisteredPins, handleSelectPin],
  );

  // 散歩していないときの「最近の散歩」（features/history）。features/walk は features/history を import しない
  // ため、ここで合成して slot に渡す（SS-147。renderMapLayers と同じ形）。
  // ゲストは記録を持てず GET /walks が 401 になるだけなので、セクションごと出さない
  // （出すとナビタブの先頭にエラーカードが常駐する。アカウントタブの記録は従来どおり 401 の分類で degrade する）。
  const idleSection = isSignedIn ? (
    <RecentWalksSection testIDPrefix="walk-active-recent-walks" />
  ) : null;

  return <WalkActiveView renderMapLayers={renderMapLayers} idleSection={idleSection} />;
}
