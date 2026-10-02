import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { PinDetailView } from "@/features/pin/components/PinDetailView";
import { usePinRegistrationGate } from "@/hooks/usePinRegistrationGate";
import { isUuid } from "@/lib/uuid";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * ピン詳細（`/pins/[pinId]`。SS-118）。散歩中の地図・ピンタブのピンをタップして push。
 *
 * `pinId` は UUID 形式を確認してから渡す（`app/walk-history/[walkId].tsx` と同じ。
 * ディープリンクの不正値を API のパスへ到達させない。詳細は `isUuid` の JSDoc を参照）。
 * `app/pins/new.tsx` と同じ画面ガードレシピ（`docs/architecture-guideline.md`）。
 * Expo Router は静的ルート（`new`）を動的ルートより優先するため衝突しない。
 * 編集画面（`./edit.tsx`）と同じディレクトリに置くため、SS-119 で `[pinId].tsx` から移した
 * （pathname `/pins/[pinId]` は変わらない）。
 */
export default function PinDetailRoute() {
  const router = useRouter();
  const { pinId } = useLocalSearchParams<{ pinId: string }>();
  const decision = usePinRegistrationGate();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  // 権限による導線の出し分け用。features/pin は認証ストアを import できないので、ここで読んで注入する。
  const currentUserId = useAuthSessionStore((state) => state.user?.id ?? null);
  const handleSignIn = useCallback(() => router.push("/(auth)/sign-in"), [router]);

  if (decision === "pending") return null;
  if (decision === "disabled") return <Redirect href="/(tabs)" />;

  return (
    <PinDetailView
      pinId={isUuid(pinId) ? pinId : null}
      isSignedIn={isSignedIn}
      currentUserId={currentUserId}
      onSignIn={handleSignIn}
    />
  );
}
