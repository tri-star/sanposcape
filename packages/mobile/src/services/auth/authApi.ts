import { ApiError } from "@/api/apiError";
import { getApiBaseUrl } from "@/config/env";
import type { AuthProvider } from "@/services/auth/types";

/**
 * `/auth/*` を叩く専用の生 fetch。`src/api/client.ts` を経由しない。
 *
 * なぜ分けるか: `client.ts` は 401 で `refreshAccessToken()` を呼ぶ。refresh 自体が `client.ts` を
 * 通ると 401 → refresh → 401 → refresh … の再帰になる。また `/auth/session` は Bearer 不要。
 *
 * 引数は camelCase（モバイル内部の規約）、送信するボディは snake_case（backend の規約）。
 * リクエスト側の命名変換はこのファイルが担う（レスポンス側は sessionMapper が担う）。
 * 戻り値は生の unknown。検証と camelCase 変換は sessionMapper.toSession に任せる。
 */
export type AuthApi = {
  createSession(input: { provider: AuthProvider; idToken: string }): Promise<unknown>;
  createDevSession(input: { userKey: string }): Promise<unknown>;
  refresh(refreshToken: string, options?: { signal?: AbortSignal }): Promise<unknown>;
  logout(refreshToken: string): Promise<void>;
};

export function createAuthApi(deps?: { baseUrl?: () => string; fetchFn?: typeof fetch }): AuthApi {
  const baseUrl = deps?.baseUrl ?? getApiBaseUrl;
  const fetchFn = deps?.fetchFn ?? fetch;

  async function post(
    path: string,
    body: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<Response> {
    const response = await fetchFn(`${baseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
    if (!response.ok) {
      throw new ApiError(response.status);
    }
    return response;
  }

  return {
    async createSession({ provider, idToken }) {
      const response = await post("/auth/session", { provider, id_token: idToken });
      return response.json();
    },
    async createDevSession({ userKey }) {
      // `/auth/dev-session` は OpenAPI に載らない（include_in_schema=False）ため、
      // Orval 生成物ではなくこのファイルのローカル定義で恒久的に扱う。
      const response = await post("/auth/dev-session", { user_key: userKey });
      return response.json();
    },
    async refresh(refreshToken, options) {
      const response = await post("/auth/refresh", { refresh_token: refreshToken }, options);
      return response.json();
    },
    async logout(refreshToken) {
      // 204 No Content 想定のためボディを読まない。
      await post("/auth/logout", { refresh_token: refreshToken });
    },
  };
}
