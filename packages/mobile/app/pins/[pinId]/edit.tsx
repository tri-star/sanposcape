import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { PinEditView } from "@/features/pin/components/PinEditView";
import { usePinRegistrationGate } from "@/hooks/usePinRegistrationGate";
import { isUuid } from "@/lib/uuid";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * ピン編集（`/pins/[pinId]/edit`。SS-119）。ピン詳細のヘッダーの編集ボタンから push。
 *
 * `[pinId]/index.tsx` と同じ画面ガードレシピ（`docs/architecture-guideline.md`）。
 * フィーチャーフラグは詳細・登録と同じ `pin_registration` を流用する（ADR-M-017）。
 */
export default function PinEditRoute() {
  const router = useRouter();
  const { pinId } = useLocalSearchParams<{ pinId: string }>();
  const decision = usePinRegistrationGate();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const currentUserId = useAuthSessionStore((state) => state.user?.id ?? null);
  const handleSignIn = useCallback(() => router.push("/(auth)/sign-in"), [router]);

  if (decision === "pending") return null;
  if (decision === "disabled") return <Redirect href="/(tabs)" />;

  return (
    <PinEditView
      pinId={isUuid(pinId) ? pinId : null}
      isSignedIn={isSignedIn}
      currentUserId={currentUserId}
      onSignIn={handleSignIn}
    />
  );
}
