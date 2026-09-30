import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { SanpoMapDetailView } from "@/features/pin/components/SanpoMapDetailView";
import { usePinRegistrationGate } from "@/hooks/usePinRegistrationGate";
import { isUuid } from "@/lib/uuid";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 地図詳細（`/sanpo-maps/[sanpoMapId]`。SS-121）。地図一覧の行から push。
 * `index` は静的ルートなので動的ルートと衝突しない。
 *
 * `sanpoMapId` は UUID 形式を確認してから渡す（`app/pins/[pinId].tsx` と同じ。ディープリンクの
 * 不正値を API のパスへ到達させない。詳細は `isUuid` の JSDoc を参照）。
 * `app/pins/new.tsx` と同じ画面ガードレシピ（`docs/architecture-guideline.md`）。
 */
export default function SanpoMapDetailRoute() {
  const router = useRouter();
  const { sanpoMapId } = useLocalSearchParams<{ sanpoMapId: string }>();
  const decision = usePinRegistrationGate();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const handleSignIn = useCallback(() => router.push("/(auth)/sign-in"), [router]);

  if (decision === "pending") return null;
  if (decision === "disabled") return <Redirect href="/(tabs)" />;

  return (
    <SanpoMapDetailView
      sanpoMapId={isUuid(sanpoMapId) ? sanpoMapId : null}
      isSignedIn={isSignedIn}
      onSignIn={handleSignIn}
    />
  );
}
