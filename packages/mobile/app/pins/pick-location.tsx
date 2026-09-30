import { Redirect } from "expo-router";

import { PinLocationPickerView } from "@/features/pin/components/PinLocationPickerView";
import { usePinRegistrationGate } from "@/hooks/usePinRegistrationGate";

/**
 * ピンの地点選択画面（ナビタブで散歩していないときの FAB から push。SS-124）。
 * 長押しした地点で `/pins/new` へ replace する（保存後の戻り先をナビタブにするため）。
 * `/pins/new` と同じく、フラグ OFF の確定時はナビタブへ戻す（`/` はスプラッシュ経由になる）。
 * ナビタブ（idle）の FAB からの旧導線。ピンタブ（SS-146）が同じ役割を持つ。
 * ナビタブの導線を削除する別課題でルートごと削除する。
 * 認証は見ない（サインインの要否は `/pins/new` の PinSignInRequired に任せる）。
 */
export default function PinPickLocationRoute() {
  const decision = usePinRegistrationGate();
  if (decision === "pending") return null;
  if (decision === "disabled") return <Redirect href="/(tabs)" />;
  return <PinLocationPickerView />;
}
