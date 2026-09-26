import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";
import { PinDetailView } from "@/features/pin/components/PinDetailView";
import { useAppConfig } from "@/hooks/useAppConfig";
import { isFeatureEnabled } from "@/lib/appConfigSnapshot";
import { resolveFeatureGateDecision } from "@/lib/featureGate";
import { isUuid } from "@/lib/uuid";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * ピン詳細（`/pins/[pinId]`。SS-118）。散歩中の地図・`/pins/map` のピンをタップして push。
 *
 * `pinId` は UUID 形式を確認してから渡す（`app/walk-history/[walkId].tsx` と同じ。
 * ディープリンクの不正値を API のパスへ到達させない。詳細は `isUuid` の JSDoc を参照）。
 * `app/pins/new.tsx` と同じ画面ガードレシピ（`docs/architecture-guideline.md`）。
 * Expo Router は静的ルート（`new` / `map` / `pick-location`）を動的ルートより優先するため衝突しない。
 */
export default function PinDetailRoute() {
  const router = useRouter();
  const { pinId } = useLocalSearchParams<{ pinId: string }>();
  const snapshot = useAppConfig();
  const decision = resolveFeatureGateDecision({
    status: snapshot.status,
    enabled: isFeatureEnabled(snapshot, FEATURE_FLAG_KEYS.pinRegistration),
  });
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const handleSignIn = useCallback(() => router.push("/(auth)/sign-in"), [router]);

  if (decision === "pending") return null;
  if (decision === "disabled") return <Redirect href="/(tabs)" />;

  return (
    <PinDetailView
      pinId={isUuid(pinId) ? pinId : null}
      isSignedIn={isSignedIn}
      onSignIn={handleSignIn}
    />
  );
}
