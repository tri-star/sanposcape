import { useLocalSearchParams } from "expo-router";

import { SanpoMapMembersView } from "@/features/pin/components/SanpoMapMembersView";
import { isUuid } from "@/lib/uuid";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 地図のメンバー（`/sanpo-maps/[sanpoMapId]/members`。SS-249）。地図詳細のメンバーの行から push。
 * `currentUserId` は認証ストアから読んで注入する（features/pin は認証を読まない。`app/pins/[pinId]/index.tsx` と同じ）。
 */
export default function SanpoMapMembersRoute() {
  const { sanpoMapId } = useLocalSearchParams<{ sanpoMapId: string }>();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const currentUserId = useAuthSessionStore((state) =>
    state.status === "authenticated" ? (state.user?.id ?? null) : null,
  );

  return (
    <SanpoMapMembersView
      sanpoMapId={isUuid(sanpoMapId) ? sanpoMapId : null}
      currentUserId={currentUserId}
    />
  );
}
