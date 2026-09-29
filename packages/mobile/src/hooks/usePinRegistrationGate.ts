import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";
import { useAppConfig } from "@/hooks/useAppConfig";
import { isFeatureEnabled } from "@/lib/appConfigSnapshot";
import { resolveFeatureGateDecision, type FeatureGateDecision } from "@/lib/featureGate";

/**
 * pin_registration フラグの画面ガード判定（"pending" | "enabled" | "disabled"）。
 * ピン系ルート（`app/pins/*`）とピンタブ（`app/(tabs)/`）が同じ判定を書き写さないための共通 hook。
 * 使い方のレシピは `docs/architecture-guideline.md` の「画面ガードレシピ」を参照。
 */
export function usePinRegistrationGate(): FeatureGateDecision {
  const snapshot = useAppConfig();
  return resolveFeatureGateDecision({
    status: snapshot.status,
    enabled: isFeatureEnabled(snapshot, FEATURE_FLAG_KEYS.pinRegistration),
  });
}
