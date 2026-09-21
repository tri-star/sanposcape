import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";
import { PinRegisterView } from "@/features/pin/components/PinRegisterView";
import {
  parseClientWalkIdParam,
  parsePinLocationParams,
} from "@/features/pin/lib/pinLocationParams";
import type { PinRouteParams } from "@/features/pin/lib/pinLocationParams";
import { useAppConfig } from "@/hooks/useAppConfig";
import { isFeatureEnabled } from "@/lib/appConfigSnapshot";
import { resolveFeatureGateDecision } from "@/lib/featureGate";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * ピン登録画面（散歩中画面の「この場所にピンを追加」から push）。
 *
 * `docs/architecture-guideline.md`「画面ガードレシピ」の初の実例。散歩中画面からしか来ない
 * 画面なので `Redirect` 先は `/` ではなく `/(tabs)`（`/` はスプラッシュ経由になる）。
 */
export default function PinNewRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<PinRouteParams>();
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
    <PinRegisterView
      location={parsePinLocationParams(params)}
      clientWalkId={parseClientWalkIdParam(params)}
      isSignedIn={isSignedIn}
      onSignIn={handleSignIn}
    />
  );
}
