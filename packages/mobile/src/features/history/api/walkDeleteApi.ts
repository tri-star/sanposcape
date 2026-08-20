import { ApiError, isApiError } from "@/api/apiError";
import { deleteWalkWalksWalkIdDelete } from "@/api/generated/endpoints/walks/walks";
import { isUuid } from "@/lib/uuid";

export type WalkDeleteResult = {
  /** 404 だった（既に削除済み／存在しない）。呼び出し側は成功と同じ扱いでよい。 */
  alreadyDeleted: boolean;
};

/**
 * `DELETE /walks/{walk_id}` の薄いラッパ。
 *
 * 404 を成功に読み替える理由（ADR-003 決定13）: backend は削除を冪等にせず、他ユーザーの散歩・
 * 存在しない ID・削除済み ID への再送はすべて 404 を返す仕様にしている。クライアント側は
 * 「404 = 既に存在しない = 目的（この散歩が無い状態）は達成済み」として吸収し、
 * 成功時と同様に扱ってよい。この解釈をこの層に閉じ込め、msw で単体テストできるようにする。
 *
 * `walkHistoryApi.ts`（GET 系）は生成 hook ではなく素の fetcher を薄くラップする方針をそのまま
 * 踏襲する: `react-native` を値 import しないので node の vitest でテストできる。
 * `services/auth` は import しない（トークンは customFetch が authTokenProvider 経由で付ける）。
 *
 * `signal` は受け取らない／渡さない。`saveWalk`（`features/walk/api/walkApi.ts`）と同じ理由で、
 * 画面離脱で削除リクエストを中断させないため（GET 系とは意図的に扱いを変える）。
 */
export async function deleteWalk(walkId: string): Promise<WalkDeleteResult> {
  // 多層防御（fetchWalkDetail と同じ理由: 生成 URL ビルダーはエスケープしない）。
  // ただしここは 404 ではなく 422 で失敗させる —— この関数では 404 を「成功」に読み替えるため、
  // 不正な id を 404 にすると「削除できていないのに成功」になってしまう。
  if (!isUuid(walkId)) {
    throw new ApiError(422, "walkId is not a UUID");
  }

  try {
    const response = await deleteWalkWalksWalkIdDelete(walkId);
    // customFetch は非2xx で throw するため通常ここには来ない（型の網羅のため）。
    if (response.status !== 204) {
      throw new ApiError(response.status);
    }
    return { alreadyDeleted: false };
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return { alreadyDeleted: true };
    }
    throw error;
  }
}
