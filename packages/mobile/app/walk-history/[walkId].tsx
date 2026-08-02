import { useLocalSearchParams } from "expo-router";

import { WalkDetailView } from "@/features/history/components/WalkDetailView";

/** 散歩履歴の詳細（一覧・サマリから遷移）。 */
export default function WalkDetailRoute() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  return (
    <WalkDetailView walkId={typeof walkId === "string" && walkId.length > 0 ? walkId : null} />
  );
}
