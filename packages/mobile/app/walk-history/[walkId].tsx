import { useLocalSearchParams } from "expo-router";

import { WalkDetailView } from "@/features/history/components/WalkDetailView";
import { useHistoryAuthState } from "@/hooks/useHistoryAuthState";
import { useSignInNavigation } from "@/hooks/useSignInNavigation";
import { isUuid } from "@/lib/uuid";

/**
 * 散歩履歴の詳細（一覧・サマリから遷移）。
 *
 * `walkId` は UUID 形式を確認してから渡す。アプリ内遷移では一覧の id しか渡らないが、
 * ディープリンク（`sanposcape-dev://walk-history/<任意の文字列>`。本番は `sanposcape://`）はこの経路を素通りするため、
 * 不正な値を API のパスへ到達させない（詳細は `isUuid` の JSDoc を参照）。
 *
 * ディープリンクでは未サインインのままでも開けるので、認証状態を3値に写して渡し（`useHistoryAuthState`）、ゲストにはサインイン案内を出す
 * （`app/walk-history/index.tsx` と同じ。SS-45）。
 */
export default function WalkDetailRoute() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const authState = useHistoryAuthState();
  const handleSignIn = useSignInNavigation();
  return (
    <WalkDetailView
      walkId={isUuid(walkId) ? walkId : null}
      authState={authState}
      onSignIn={handleSignIn}
    />
  );
}
