import { Redirect, useRouter } from "expo-router";
import { useCallback } from "react";

import { SanpoMapListView } from "@/features/pin/components/SanpoMapListView";
import { usePinRegistrationGate } from "@/hooks/usePinRegistrationGate";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 地図一覧（`/sanpo-maps`）。SS-121 で本実装（SS-146 では暫定画面だった）。
 * ゲストはサインイン案内を出す（通信しない。ADR-M-014 D6）。
 * `app/pins/[pinId]/index.tsx` と同じ画面ガードレシピ（`docs/architecture-guideline.md`）。
 * OFF 確定時の戻り先は `/(tabs)`（ピンタブも OFF ではナビタブへリダイレクトするため）。
 */
export default function SanpoMapListRoute() {
  const router = useRouter();
  const decision = usePinRegistrationGate();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const handleSignIn = useCallback(() => router.push("/(auth)/sign-in"), [router]);

  if (decision === "pending") return null;
  if (decision === "disabled") return <Redirect href="/(tabs)" />;
  return <SanpoMapListView isSignedIn={isSignedIn} onSignIn={handleSignIn} />;
}
