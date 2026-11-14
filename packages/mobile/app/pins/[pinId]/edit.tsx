import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { PinEditView } from "@/features/pin/components/PinEditView";
import { isUuid } from "@/lib/uuid";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * ピン編集（`/pins/[pinId]/edit`。SS-119）。ピン詳細のヘッダーの編集ボタンから push。
 */
export default function PinEditRoute() {
  const router = useRouter();
  const { pinId } = useLocalSearchParams<{ pinId: string }>();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const currentUserId = useAuthSessionStore((state) => state.user?.id ?? null);
  const handleSignIn = useCallback(() => router.push("/(auth)/sign-in"), [router]);

  return (
    <PinEditView
      pinId={isUuid(pinId) ? pinId : null}
      isSignedIn={isSignedIn}
      currentUserId={currentUserId}
      onSignIn={handleSignIn}
    />
  );
}
