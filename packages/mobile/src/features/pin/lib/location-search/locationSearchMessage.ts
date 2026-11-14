import { isApiError } from "@/api/apiError";
import type { LocationSearchScope } from "@/features/pin/lib/location-search/locationSearch";

/**
 * 検索欄の下に出す短い案内（SS-267）。結果が出たとき（表示範囲の中）は出さない。
 */
export function locationSearchResultMessage(input: {
  query: string;
  resultCount: number;
  scope: LocationSearchScope;
}): string | null {
  if (input.resultCount === 0) return `「${input.query}」に当てはまる場所は見つかりませんでした`;
  if (input.scope === "expanded") return "表示している範囲には無かったので、付近から探しました";
  return null;
}

/** 失敗の案内。429・503・通信の失敗だけ分け、それ以外はまとめる。 */
export function locationSearchErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 429) {
      return "検索の回数が上限に達しました。しばらく時間をおいてからお試しください";
    }
    if (error.status === 503) {
      return "地図サービスに接続できませんでした。時間をおいてもう一度お試しください";
    }
    return "検索できませんでした。もう一度お試しください";
  }
  if (error instanceof TypeError) {
    return "通信に失敗しました。電波状況を確認してもう一度お試しください";
  }
  return "検索できませんでした。もう一度お試しください";
}
