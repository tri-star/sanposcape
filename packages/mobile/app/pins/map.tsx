import { Redirect, useRouter } from "expo-router";
import { useCallback } from "react";

import { PinMapView } from "@/features/pin/components/PinMapView";
import { usePinRegistrationGate } from "@/hooks/usePinRegistrationGate";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 登録済みピンの地図（`/pins/map`。SS-118）。
 * ナビタブの idle の「登録したピンを地図で見る」から push。ピンのタップで `/pins/[pinId]` へ push する。
 * `app/pins/pick-location.tsx` と同じ画面ガードレシピ（`docs/architecture-guideline.md`）。
 */
export default function PinMapRoute() {
  const router = useRouter();
  const decision = usePinRegistrationGate();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const handleSignIn = useCallback(() => router.push("/(auth)/sign-in"), [router]);

  if (decision === "pending") return null;
  if (decision === "disabled") return <Redirect href="/(tabs)" />;

  return <PinMapView isSignedIn={isSignedIn} onSignIn={handleSignIn} />;
}
