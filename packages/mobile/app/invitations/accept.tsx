import { Stack, useLocalSearchParams } from "expo-router";

import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";
import { InvitationAcceptView } from "@/features/pin/components/InvitationAcceptView";
import { isInvitationToken } from "@/features/pin/lib/invitation";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useSignInNavigation } from "@/hooks/useSignInNavigation";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 招待の受諾画面（`/invitations/accept?token=<token>`。SS-250）。招待リンク
 * （`https://sanposcape.com/i/#<token>` など）は `app/+native-intent.tsx` がここへ書き換える。
 * 地図一覧の「招待リンクで参加」からも開く。モーダルで重ね、散歩中でも閉じれば元の画面に戻る。
 * トークンはルートパラメータ（メモリ）にだけ持ち、端末には保存しない。形を検証してから画面に渡す。
 * ゲストのサインインは `returnTo: "invitation"` で、サインイン後にこの画面へ戻す（ADR-M-009 の許可リスト）。
 */
export default function InvitationAcceptRoute() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const appConfig = useAppConfig();
  const mapInvitationEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.mapInvitation);
  const signedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const myDisplayName = useAuthSessionStore((state) => state.user?.displayName ?? null);
  const signIn = useSignInNavigation(undefined, "invitation");

  return (
    <>
      <Stack.Screen options={{ presentation: "modal" }} />
      {appConfig.status === "loading" ? null : (
        <InvitationAcceptView
          token={isInvitationToken(token) ? token : null}
          signedIn={signedIn}
          myDisplayName={myDisplayName}
          mapInvitationEnabled={mapInvitationEnabled}
          onSignIn={signIn}
        />
      )}
    </>
  );
}
