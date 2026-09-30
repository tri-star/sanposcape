import { Redirect } from "expo-router";

import { SanpoMapListView } from "@/features/pin/components/SanpoMapListView";
import { usePinRegistrationGate } from "@/hooks/usePinRegistrationGate";

/**
 * 地図一覧（`/sanpo-maps`）。SS-121 で本実装する。SS-146 ではピンタブの「地図一覧」ボタンの
 * 遷移先として暫定画面を置く。
 * `app/pins/new.tsx` と同じ画面ガードレシピ（`docs/architecture-guideline.md`）。
 * OFF 確定時の戻り先は `/(tabs)`（ピンタブも OFF ではナビタブへリダイレクトするため）。
 */
export default function SanpoMapListRoute() {
  const decision = usePinRegistrationGate();
  if (decision === "pending") return null;
  if (decision === "disabled") return <Redirect href="/(tabs)" />;
  return <SanpoMapListView />;
}
