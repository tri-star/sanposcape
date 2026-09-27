import { Redirect, useRouter } from "expo-router";
import { useCallback } from "react";

import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";
import { PinMapView } from "@/features/pin/components/PinMapView";
import { useAppConfig } from "@/hooks/useAppConfig";
import { isFeatureEnabled } from "@/lib/appConfigSnapshot";
import { resolveFeatureGateDecision } from "@/lib/featureGate";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 登録済みピンの地図（`/pins/map`。SS-118）。
 * ナビタブの idle の「登録したピンを地図で見る」から push。ピンのタップで `/pins/[pinId]` へ push する。
 * `app/pins/pick-location.tsx` と同じ画面ガードレシピ（`docs/architecture-guideline.md`）。
 */
export default function PinMapRoute() {
  const router = useRouter();
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

  return <PinMapView isSignedIn={isSignedIn} onSignIn={handleSignIn} />;
}
