import { ApiError } from "@/api/apiError";
import { deleteMeUsersMeDelete } from "@/api/generated/endpoints/users/users";

/**
 * `DELETE /users/me` の薄いラッパ。`Bearer token` で解決した本人のアカウントを削除する。
 *
 * 配置根拠: `features/history/api/walkDeleteApi.ts`（SS-60）に倣い `features/settings/api/` に
 * 置く。呼び出し元は設定画面の1箇所のみで、`docs/folder-structure.md` の「その機能の外から
 * import されるものは features に置かない」に沿う（2機能目が現れたら `features/account/` へ
 * 昇格する）。
 *
 * `src/services/auth/` には置かない: `services/auth`（`authApi.ts`）は `/auth/*` を
 * **意図的に `customFetch` を通さない生 fetch** で呼ぶ層（401→refresh の再帰回避のため）で
 * あり、ここにビジネス API を混ぜると3つ目の HTTP 出口を生む（Backlog SS-76 が問題視している
 * 状態を再生産する）。`/users/me` は CloudFront 経由の横断ヘッダー（`X-App-Authorization` /
 * `x-amz-content-sha256`）を付ける `customFetch` 経由が必須（SS-70）。トークンは `customFetch`
 * が `authTokenProvider` 経由で付けるため、この層は `@/services/auth` も `@/store/*` も
 * import しない。
 *
 * `walkDeleteApi.ts` との意図的な差: **404 を成功に読み替える処理は入れない**。
 * `DELETE /users/me` は `get_current_user` で本人を解決するため、ユーザーが既に存在しなければ
 * 404 ではなく **401**（`Authorization` 欠落/無効）になる。404 の読み替えを書くと
 * 「実際には消えていないのに成功」を作りうる。
 *
 * `signal` は受け取らない／渡さない。`saveWalk` / `deleteWalk` と同じ理由で、画面離脱で
 * 破壊的リクエスト（アカウント削除）を中断させないため。
 *
 * パスパラメータが無いため UUID 等の多層防御は不要。
 */
export async function deleteAccount(): Promise<void> {
  const response = await deleteMeUsersMeDelete();
  // customFetch は非2xx で throw するため通常ここには来ない（型の網羅のため）。
  if (response.status !== 204) {
    throw new ApiError(response.status);
  }
}
