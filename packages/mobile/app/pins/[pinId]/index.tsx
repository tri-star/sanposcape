import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { PinDetailView } from "@/features/sanpo-map/pin/components/PinDetailView";
import { useActiveWalkStore } from "@/features/walk/active/store/useActiveWalkStore";
import { buildPinWalkStartParams } from "@/features/walk/explore/lib/pinWalkDestination";
import { isUuid } from "@/lib/uuid";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * ピン詳細（`/pins/[pinId]`。SS-118）。散歩中の地図・ピンタブのピンをタップして push。
 *
 * `pinId` は UUID 形式を確認してから渡す（`app/walk-history/[walkId].tsx` と同じ。
 * ディープリンクの不正値を API のパスへ到達させない。詳細は `isUuid` の JSDoc を参照）。
 * Expo Router は静的ルート（`new`）を動的ルートより優先するため衝突しない。
 * 編集画面（`./edit.tsx`）と同じディレクトリに置くため、SS-119 で `[pinId].tsx` から移した
 * （pathname `/pins/[pinId]` は変わらない）。
 *
 * 「このピンまで散歩する」（SS-170）の遷移もここで作って注入する（features/sanpo-map は features/walk に依存しない）。
 * 進行中の散歩があるときは注入しない（散歩中の地図からも詳細を開けるので、開始で上書きしないよう導線を出さない）。
 */
export default function PinDetailRoute() {
  const router = useRouter();
  const { pinId } = useLocalSearchParams<{ pinId: string }>();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  // 権限による導線の出し分け用。features/sanpo-map は認証ストアを import できないので、ここで読んで注入する。
  const currentUserId = useAuthSessionStore((state) => state.user?.id ?? null);
  const handleSignIn = useCallback(() => router.push("/(auth)/sign-in"), [router]);
  const hasActiveWalk = useActiveWalkStore((state) => state.activeWalk !== null);
  const handleWalkToPin = useCallback(
    (pin: Parameters<typeof buildPinWalkStartParams>[0]) =>
      router.push({ pathname: "/walk-start", params: buildPinWalkStartParams(pin) }),
    [router],
  );

  return (
    <PinDetailView
      pinId={isUuid(pinId) ? pinId : null}
      isSignedIn={isSignedIn}
      currentUserId={currentUserId}
      onSignIn={handleSignIn}
      onWalkToPin={hasActiveWalk ? undefined : handleWalkToPin}
    />
  );
}
