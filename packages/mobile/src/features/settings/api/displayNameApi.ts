import { ApiError } from "@/api/apiError";
import { updateMeUsersMePatch } from "@/api/generated/endpoints/users/users";
// 型だけを読む（バレルを実行時に import すると認証の実体まで読み込む。accountDeleteApi.ts と同じく、
// この層は認証サービスに依存しない）。
import type { AuthUser } from "@/services/auth/types";

/**
 * `PATCH /users/me` の薄いラッパ（SS-268）。本人の表示名を変え、変えた後のユーザーを返す。
 *
 * 配置と HTTP の出口は `accountDeleteApi.ts` と同じ（`customFetch` を通す Orval の関数を使い、
 * `services/auth` の生 fetch には混ぜない）。応答（snake_case の `UserRead`）を、認証セッションが持つ
 * `AuthUser`（camelCase）へここで写す。`signal` は渡さない（画面を離れても保存は中断させない）。
 */
export async function updateDisplayName(displayName: string): Promise<AuthUser> {
  const response = await updateMeUsersMePatch({ display_name: displayName });
  // customFetch は非2xx で throw するため通常ここには来ない（型の網羅のため）。
  if (response.status !== 200) {
    throw new ApiError(response.status);
  }
  const user = response.data;
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    photoUrl: user.photo_url,
  };
}
