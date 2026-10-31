import { Redirect, useLocalSearchParams } from "expo-router";

import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";
import { SanpoMapMembersView } from "@/features/pin/components/SanpoMapMembersView";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { usePinRegistrationGate } from "@/hooks/usePinRegistrationGate";
import { isUuid } from "@/lib/uuid";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 地図のメンバー（`/sanpo-maps/[sanpoMapId]/members`。SS-249）。地図詳細のメンバーの行から push。
 * 地図詳細と同じ画面ガード（ピン登録のフラグ）に加え、フラグ `map_invitation` を読んで渡す。OFF でも
 * 自分が editor の地図なら開ける（抜けられるように）ので、その判定は地図の役割が分かる画面側で行う。
 * `currentUserId` は認証ストアから読んで注入する（features/pin は認証を読まない。`app/pins/[pinId]/index.tsx` と同じ）。
 */
export default function SanpoMapMembersRoute() {
  const { sanpoMapId } = useLocalSearchParams<{ sanpoMapId: string }>();
  const decision = usePinRegistrationGate();
  const mapInvitationEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.mapInvitation);
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const currentUserId = useAuthSessionStore((state) =>
    state.status === "authenticated" ? (state.user?.id ?? null) : null,
  );

  if (decision === "pending") return null;
  if (decision === "disabled") return <Redirect href="/(tabs)" />;

  return (
    <SanpoMapMembersView
      sanpoMapId={isUuid(sanpoMapId) ? sanpoMapId : null}
      currentUserId={currentUserId}
      mapInvitationEnabled={mapInvitationEnabled}
    />
  );
}
