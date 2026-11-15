import { useRouter } from "expo-router";
import { useCallback } from "react";

import { SanpoMapListView } from "@/features/pin/components/SanpoMapListView";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 地図一覧（`/sanpo-maps`）。SS-121 で本実装（SS-146 では暫定画面だった）。
 * ゲストはサインイン案内を出す（通信しない。ADR-M-014 D6）。
 */
export default function SanpoMapListRoute() {
  const router = useRouter();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const handleSignIn = useCallback(() => router.push("/(auth)/sign-in"), [router]);

  return <SanpoMapListView isSignedIn={isSignedIn} onSignIn={handleSignIn} />;
}
