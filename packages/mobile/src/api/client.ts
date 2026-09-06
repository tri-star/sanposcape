import { ApiError } from "@/api/apiError";
import { getAuthTokenProvider } from "@/api/authTokenProvider";
import { withAuthHeader } from "@/api/authHeaders";
import { withContentHashHeader } from "@/api/contentHash";
import { shouldRefreshAndRetry } from "@/api/retryPolicy";
import { getApiBaseUrl } from "@/config/env";

/**
 * Orval が生成するクライアントが利用する共通 fetch 実装（mutator）。
 * backend のベースURLを付与し、エラーとレスポンスの解釈を一元化する。
 * 生成物は `src/api/generated/` に出力される（手編集禁止）。
 *
 * `X-App-Authorization: Bearer` の付与と `x-amz-content-sha256` の付与、
 * 401 → refresh → 1回だけリトライを行う。
 * `services/auth` の直接 import は避ける（循環参照のため）。ネイティブ依存については、
 * real/mock の分岐を持たず振る舞いが環境非依存なもの（`expo-crypto` 等。vitest の alias で
 * モック可能）は許容する（`@/api/contentHash` が実例）。それ以外（`services/auth` 系）は
 * `@/api/authTokenProvider` のレジストリ経由でのみ連携する。
 */
export const customFetch = async <T>(url: string, options: RequestInit): Promise<T> => {
  const base = getApiBaseUrl();
  const provider = getAuthTokenProvider();
  const token = provider ? await provider.getAccessToken() : null;

  // ボディはリトライしても変わらないため、ハッシュ計算は1回だけにする。
  const signedOptions = await withContentHashHeader(options);

  // `redirect: "error"` について:
  // 標準の `Authorization` は WHATWG Fetch 仕様によりクロスオリジンリダイレクト時に自動削除されるが、
  // 独自ヘッダーの `X-App-Authorization` はこの保護の対象外（`withAuthHeader` 参照）。
  // 仕様準拠の意思表示として明示しているが、**RN 実機ではこのオプションは実効的な防御にならない**。
  // RN 0.86 の global fetch は `node_modules/react-native/Libraries/Network/fetch.js` が
  // `whatwg-fetch`（XMLHttpRequest ベースのポリフィル）をそのまま re-export したもので、
  // `whatwg-fetch` の `Request` コンストラクタは `options.redirect` を一切読まない
  // （XHR ベースのため実際のリダイレクトは常に追従される）。
  // `react-native-web` や将来 RN が spec 準拠 fetch に移行した場合には効くため無害だが、
  // 「これで守られている」と誤解しないこと。実効的な防御は「この API がリダイレクトを
  // 返さないこと」に依存し続ける。
  let response = await fetch(
    `${base}${url}`,
    withAuthHeader({ ...signedOptions, redirect: "error" }, token),
  );

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
      response = await fetch(
        `${base}${url}`,
        withAuthHeader({ ...signedOptions, redirect: "error" }, refreshed),
      );
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
