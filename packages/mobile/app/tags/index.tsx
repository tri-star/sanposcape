import { useRouter } from "expo-router";
import { useCallback } from "react";

import { TagListView } from "@/features/pin/components/tag/TagListView";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * タグ一覧（`/tags`。SS-245）。ピンタブの「タグ一覧」から push。
 */
export default function TagListRoute() {
  const router = useRouter();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const handleSignIn = useCallback(() => router.push("/(auth)/sign-in"), [router]);

  return <TagListView isSignedIn={isSignedIn} onSignIn={handleSignIn} />;
}
