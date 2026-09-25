import { Redirect } from "expo-router";

import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";
import { PinLocationPickerView } from "@/features/pin/components/PinLocationPickerView";
import { useAppConfig } from "@/hooks/useAppConfig";
import { isFeatureEnabled } from "@/lib/appConfigSnapshot";
import { resolveFeatureGateDecision } from "@/lib/featureGate";

/**
 * ピンの地点選択画面（ナビタブで散歩していないときの FAB から push。SS-124）。
 * 長押しした地点で `/pins/new` へ replace する（保存後の戻り先をナビタブにするため）。
 * `/pins/new` と同じく、フラグ OFF の確定時はナビタブへ戻す（`/` はスプラッシュ経由になる）。
 * 認証は見ない（サインインの要否は `/pins/new` の PinSignInRequired に任せる）。
 */
export default function PinPickLocationRoute() {
  const snapshot = useAppConfig();
  const decision = resolveFeatureGateDecision({
    status: snapshot.status,
    enabled: isFeatureEnabled(snapshot, FEATURE_FLAG_KEYS.pinRegistration),
  });
  if (decision === "pending") return null;
  if (decision === "disabled") return <Redirect href="/(tabs)" />;
  return <PinLocationPickerView />;
}
