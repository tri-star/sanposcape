import { useLocalSearchParams } from "expo-router";

import { WalkDetailView } from "@/features/history/components/WalkDetailView";
import { isUuid } from "@/lib/uuid";

/**
 * 散歩履歴の詳細（一覧・サマリから遷移）。
 *
 * `walkId` は UUID 形式を確認してから渡す。アプリ内遷移では一覧の id しか渡らないが、
 * ディープリンク（`sanposcape://walk-history/<任意の文字列>`）はこの経路を素通りするため、
 * 不正な値を API のパスへ到達させない（詳細は `isUuid` の JSDoc を参照）。
 */
export default function WalkDetailRoute() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  return <WalkDetailView walkId={isUuid(walkId) ? walkId : null} />;
}
