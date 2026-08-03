import type { ListWalksWalksGetParams } from "@/api/generated/model";

/** 1ページの件数（backend の既定と同じ 20。上限 50）。 */
export const WALK_HISTORY_PAGE_SIZE = 20;

/** limit の下限・上限（backend の `@minimum 1` / `@maximum 50` と同値）。 */
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;

/**
 * 履歴一覧の limit を backend の受け入れ範囲に正規化する。
 *
 * リクエストだけでなく TanStack Query の queryKey もこの値を使い、同じ実リクエストなのに
 * 異なるキャッシュエントリが作られないようにする。
 */
export function normalizeWalkHistoryLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return WALK_HISTORY_PAGE_SIZE;
  }
  const truncated = Math.trunc(limit);
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, truncated));
}

/**
 * `GET /walks` のクエリパラメータを組み立てる純粋関数。
 *
 * **重要な落とし穴**: Orval 生成の `getListWalksWalksGetUrl` は
 * `if (value !== undefined) { params.append(key, value === null ? 'null' : String(value)) }`
 * という実装なので、`cursor: null` を渡すと `?cursor=null` というリテラル文字列が送られ、
 * backend が 400（Invalid cursor）を返す。`cursor` は「文字列かつ空文字でない」ときだけ
 * キー自体を立て、それ以外は `undefined`（＝キーを作らない）にする。
 *
 * `started_after` / `started_before` は SS-20 では使わない（期間フィルタは非スコープ）。
 */
export function buildWalkListParams(input: {
  limit?: number;
  cursor?: string | null;
}): ListWalksWalksGetParams {
  const params: ListWalksWalksGetParams = {
    limit: normalizeWalkHistoryLimit(input.limit),
  };

  if (typeof input.cursor === "string" && input.cursor.length > 0) {
    params.cursor = input.cursor;
  }

  return params;
}
