import { Redirect, useRouter } from "expo-router";
import { useCallback } from "react";

import { TagListView } from "@/features/pin/components/tag/TagListView";
import { usePinRegistrationGate } from "@/hooks/usePinRegistrationGate";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * タグ一覧（`/tags`。SS-245）。ピンタブの「タグ一覧」から push。
 * `app/sanpo-maps/index.tsx` と同じ画面ガードレシピ（`docs/architecture-guideline.md`）。
 * OFF 確定時の戻り先は `/(tabs)`（ピンタブも OFF ではナビタブへリダイレクトするため）。
 */
export default function TagListRoute() {
  const router = useRouter();
  const decision = usePinRegistrationGate();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const handleSignIn = useCallback(() => router.push("/(auth)/sign-in"), [router]);

  if (decision === "pending") return null;
  if (decision === "disabled") return <Redirect href="/(tabs)" />;
  return <TagListView isSignedIn={isSignedIn} onSignIn={handleSignIn} />;
}
