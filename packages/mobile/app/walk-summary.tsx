import { useRouter } from "expo-router";
import { useCallback } from "react";

import { WalkSummaryView } from "@/features/walk/components/WalkSummaryView";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 散歩終了サマリ画面（散歩中画面から push）。
 *
 * `features/walk` は認証状態を import できない（ADR-009 決定8）ため、
 * 認証済みかどうかと「サインイン画面へ送る」導線はこのルートが注入する（SS-37）。
 * サインイン画面へは `push` で送る（`replace` にすると、サインインをやめたときに
 * サマリ画面へ戻れず新しい行き止まりを作ってしまうため）。
 */
export default function WalkSummaryRoute() {
  const router = useRouter();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー別参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const handleSignIn = useCallback(() => {
    router.push("/(auth)/sign-in");
  }, [router]);

  return <WalkSummaryView isSignedIn={isSignedIn} onSignIn={handleSignIn} />;
}
