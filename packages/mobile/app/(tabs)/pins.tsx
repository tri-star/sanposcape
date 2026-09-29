import { Redirect } from "expo-router";

import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";
import { PinTabView } from "@/features/pin/components/PinTabView";
import { useAppConfig } from "@/hooks/useAppConfig";
import { isFeatureEnabled } from "@/lib/appConfigSnapshot";
import { resolveFeatureGateDecision } from "@/lib/featureGate";

/**
 * ピンタブ（SS-145。ログイン直後の着地点）。中身は SS-146 で本実装に差し替える暫定の `PinTabView`。
 * pin_registration が OFF と確定したらナビタブへリダイレクトする（ログイン後の着地点のフォールバック。
 * `Redirect` はフォーカス中にだけ動くので、別タブにいる間に OFF になってもユーザーを動かさない）。
 * 取得中（pending）は何も描かない（ON なのに追い出す事故を防ぐ）。
 */
export default function PinTabRoute() {
  const snapshot = useAppConfig();
  const decision = resolveFeatureGateDecision({
    status: snapshot.status,
    enabled: isFeatureEnabled(snapshot, FEATURE_FLAG_KEYS.pinRegistration),
  });
  if (decision === "pending") return null;
  if (decision === "disabled") return <Redirect href="/(tabs)" />;
  return <PinTabView />;
}
