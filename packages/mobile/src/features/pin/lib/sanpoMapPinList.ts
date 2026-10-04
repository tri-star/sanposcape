import type { ListPinsParams } from "@/api/generated/model";

/** 1リクエストの件数（backend の上限 200）。 */
export const SANPO_MAP_PIN_PAGE_SIZE = 200;
/** 取得するページ数の上限。これを超える分は表示・検索の対象にしない（truncated）。 */
export const SANPO_MAP_PIN_MAX_PAGES = 5;

/**
 * 地図単位のピン一覧のクエリ。sanpo_map_id と limit=200 だけを入れ、cursor は空でない文字列のときだけ
 * キーを立てる（Orval の URL ビルダーは `cursor: null` を `?cursor=null` にしてしまう。
 * `walkHistoryParams.ts` と同じ落とし穴）。bbox・q・tags のキーは作らない。
 * `archived` / `visited` も送らない（地図詳細の一覧はアーカイブ済みも出す。アーカイブを解除できる
 * 唯一の導線のため。SS-173。ADR-M-021）。
 */
export function buildSanpoMapPinListParams(input: {
  sanpoMapId: string;
  cursor: string | null;
}): ListPinsParams {
  const params: ListPinsParams = {
    sanpo_map_id: input.sanpoMapId,
    limit: SANPO_MAP_PIN_PAGE_SIZE,
  };
  if (typeof input.cursor === "string" && input.cursor.length > 0) {
    params.cursor = input.cursor;
  }
  return params;
}
