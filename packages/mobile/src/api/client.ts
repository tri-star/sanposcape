import { ApiError } from "@/api/apiError";
import { getAuthTokenProvider } from "@/api/authTokenProvider";
import { withAuthHeader } from "@/api/authHeaders";
import { shouldRefreshAndRetry } from "@/api/retryPolicy";
import { getApiBaseUrl } from "@/config/env";

/**
 * Orval が生成するクライアントが利用する共通 fetch 実装（mutator）。
 * backend のベースURLを付与し、エラーとレスポンスの解釈を一元化する。
 * 生成物は `src/api/generated/` に出力される（手編集禁止）。
 *
 * `Authorization: Bearer` の付与と 401 → refresh → 1回だけリトライを行う。
 * `services/auth` は直接 import しない（循環参照とネイティブ依存混入を避けるため、
 * `@/api/authTokenProvider` のレジストリ経由でのみ連携する）。
 */
export const customFetch = async <T>(url: string, options: RequestInit): Promise<T> => {
  const base = getApiBaseUrl();
  const provider = getAuthTokenProvider();
  const token = provider ? await provider.getAccessToken() : null;

  let response = await fetch(`${base}${url}`, withAuthHeader(options, token));

  // リトライは最大1回（alreadyRetried は固定で false を渡し、2回目の判定は行わない=ループにしない）。
  if (
    provider &&
    shouldRefreshAndRetry({
      status: response.status,
      hadToken: token !== null,
      alreadyRetried: false,
    })
  ) {
    const refreshed = await provider.refreshAccessToken();
    if (refreshed) {
      response = await fetch(`${base}${url}`, withAuthHeader(options, refreshed));
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status);
  }

  // 204 No Content など本文が無い場合に配慮
  const text = response.status === 204 ? "" : await response.text();
  const data = text ? JSON.parse(text) : undefined;

  // Orval の fetch client は mutator が { status, data, headers } を返す前提で型を生成する。
  // 非2xx は throw する方針（TanStack Query の error に載せる）なので、
  // ここに到達するのは 2xx のみ。
  return { status: response.status, data, headers: response.headers } as T;
};

export default customFetch;
