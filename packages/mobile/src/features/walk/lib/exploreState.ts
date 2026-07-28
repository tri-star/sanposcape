import { isApiError } from "@/api/apiError";

export type ExploreErrorKind = "auth" | "rate-limit" | "unavailable" | "network" | "unknown";

export function classifyExploreError(error: unknown): ExploreErrorKind {
  if (isApiError(error)) {
    if (error.status === 401) return "auth";
    if (error.status === 429) return "rate-limit";
    if (error.status === 503) return "unavailable";
  }
  if (error instanceof TypeError) return "network";
  return "unknown";
}

export function exploreErrorMessage(kind: ExploreErrorKind): string {
  const messages: Record<ExploreErrorKind, string> = {
    auth: "ログイン状態を確認して、もう一度お試しください。",
    "rate-limit": "検索が混み合っています。少し待ってからお試しください。",
    unavailable: "スポット検索は一時的に利用できません。",
    network: "通信できませんでした。接続を確認してください。",
    unknown: "スポットを取得できませんでした。",
  };
  return messages[kind];
}

export function shouldKeepSelectedSpot(
  selectedSpotId: string | null,
  candidateIds: readonly string[],
): boolean {
  return selectedSpotId !== null && candidateIds.includes(selectedSpotId);
}
