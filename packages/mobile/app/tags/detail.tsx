import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { TagDetailView } from "@/features/pin/components/tag/TagDetailView";
import { parseTagLabelParam } from "@/features/pin/lib/tag/pinTagIndex";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * タグ詳細（`/tags/detail?label=`。SS-245）。タグ一覧の行・ピン詳細のタグから push。
 * タグの表記には `/` などが入りうるので、動的セグメント（`[label].tsx`）にせずクエリで受ける。
 * `label` は `parseTagLabelParam` で正規化・検証してから渡す（ディープリンクの不正値は「見つからない」）。
 */
export default function TagDetailRoute() {
  const router = useRouter();
  const { label } = useLocalSearchParams<{ label?: string }>();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const handleSignIn = useCallback(() => router.push("/(auth)/sign-in"), [router]);

  return (
    <TagDetailView
      label={parseTagLabelParam(label)}
      isSignedIn={isSignedIn}
      onSignIn={handleSignIn}
    />
  );
}
