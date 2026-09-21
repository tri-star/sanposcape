import { ApiError } from "@/api/apiError";
import { getAppConfig } from "@/api/generated/endpoints/app-config/app-config";
import type { AppConfigRead } from "@/api/generated/model";

/**
 * `/app-config` を取得する。Orval が生成した**素の fetcher**を薄くラップしている
 * （生成 hook `useGetAppConfig` は使わない。理由は `docs/folder-structure.md`
 * 「状態管理の使い分け」と同じで、queryKey/retry/staleTime を自前制御し、
 * `react-native` を値 import しない＝node の vitest でテストできるようにするため）。
 * 手本: `src/features/history/api/walkStatsApi.ts`（`fetchWalkStats`）。
 *
 * - `features/<feature>/api/` ではなく `src/api/` 直下に置く理由:
 *   `/app-config` は特定の機能に属さず**アプリ基盤の設定取得**であり、
 *   `features/*` が横断的に参照する（`docs/folder-structure.md` の「その機能の外から import されるものは
 *   features に置かない」に従った結果の配置）。
 * - 認証不要のエンドポイントだが、`customFetch` は provider 登録済みならトークンを付ける。
 *   backend は無視するので問題にならない（`/health` と同じ扱い）。
 * - `Cache-Control: no-store` は **OpenAPI には現れない**（ADR-008 追補 D10）。
 *   クライアント側のキャッシュ方針は `hooks/useAppConfig.ts` が持つ。
 * - 一時障害（429 / 502 / 503 / 504 / 通信断）の再送は `customFetch` の `sendWithTransientRetry` が
 *   GET なので自動で効く。ここでは追加の再送を書かない。
 */
export async function fetchAppConfig(options?: { signal?: AbortSignal }): Promise<AppConfigRead> {
  const response = await getAppConfig({ signal: options?.signal });
  if (response.status !== 200) {
    throw new ApiError(response.status);
  }
  return response.data;
}
