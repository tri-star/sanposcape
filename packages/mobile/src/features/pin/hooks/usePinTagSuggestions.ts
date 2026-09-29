import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchPinTagSuggestions } from "@/features/pin/api/pinTagSuggestionApi";
import { pinTagSuggestionsQueryKey } from "@/features/pin/lib/pinQueryKeys";
import type { TagSuggestion } from "@/features/pin/types";

/** 登録画面を開いている間はほぼ変わらない（`useSanpoMaps` と同じ値）。 */
const STALE_TIME_MS = 5 * 60_000;

export type UsePinTagSuggestionsResult = {
  /** 取得できなかったとき・未取得のときは空配列。 */
  candidates: TagSuggestion[];
};

export type UsePinTagSuggestionsOptions = {
  /** null なら取得しない（地図一覧が未取得、または既定地図がまだ無い）。 */
  sanpoMapId: string | null;
  /** ルートから注入される isSignedIn（ゲストで 401 を踏みに行かない）。 */
  enabled: boolean;
};

/**
 * 保存先の地図で使われているタグの候補（SS-136）。
 * 候補は補助機能なので、失敗してもエラーは出さず空にする（自由入力で登録できる。
 * backend 未デプロイの環境の 404 もここに入る）。地図を選び直すと別のキーで取り直し、
 * 取得中は空になる（前の地図の語彙を混ぜないため `keepPreviousData` は使わない）。
 * 一時障害の再送は `customFetch` が行うので `retry: false`。
 */
export function usePinTagSuggestions(
  options: UsePinTagSuggestionsOptions,
): UsePinTagSuggestionsResult {
  const { sanpoMapId } = options;
  const query = useQuery({
    queryKey: pinTagSuggestionsQueryKey(sanpoMapId),
    // 取得先が無いときは skipToken（型で `sanpoMapId` が string に絞られる）。
    queryFn:
      options.enabled && sanpoMapId !== null
        ? ({ signal }) => fetchPinTagSuggestions(sanpoMapId, { signal })
        : skipToken,
    staleTime: STALE_TIME_MS,
    retry: false,
  });
  return { candidates: query.data ?? [] };
}
