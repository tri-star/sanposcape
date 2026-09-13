/**
 * CloudFront / Lambda 由来の一時障害（429 / 502 / 503 / 504 / 通信断）に対する再送ポリシー。
 *
 * dev 環境の実運用上の制約（infra 照会）:
 *   - API Lambda の `ReservedConcurrentExecutions: 5`（6本目から 429）
 *   - CloudFront のオリジン待ち 30 秒（超過で 504）
 *   - コールドスタート 1〜3 秒
 * に対して、クライアント側で軽い再送を挟み、一時的な失敗をユーザーに露出しにくくする。
 *
 * **この層で再送するのは GET / HEAD だけである。** 3つの理由がある（詳細は
 * `packages/mobile/docs/build-profiles.md` の「一時障害の再送」節も参照）。
 *
 * 1. `POST /explore/places` / `POST /explore/routes/walking` の 429 は backend 自身の
 *    レート制限（`packages/backend/src/sanposcape/maps/dependencies.py`）であり、
 *    Lambda のスロットルと区別が付かない。再送するとレート制限を悪化させるだけになる。
 *    `useSpotCandidates` が意図的に `retry: false` にしている判断を、transport 層が
 *    黙って上書きしてはならない。
 * 2. `POST /walks` は `useWalkSave` が既に指数バックオフ再送を持っている
 *    （最大2回 / `1000 * 2 ** n`）。transport 層でも再送すると試行回数が掛け合わさって
 *    増えるだけで、429 を踏んでいる状況ではむしろ逆効果。
 * 3. `POST /auth/refresh` の再送はセッションを破壊する。backend はリフレッシュトークンを
 *    ローテーションしており、`used_at` が設定済みのトークンの再提示を再利用検知として扱い、
 *    `revoke_family` でファミリー全体を失効させる
 *    （`packages/backend/src/sanposcape/auth/service.py`）。504 や通信断で
 *    「サーバーは成功したがレスポンスが届かなかった」場合に同じトークンで再送すると、
 *    ユーザーが強制サインアウトされる。`src/services/auth/authApi.ts` はこの層を通らない
 *    独立した出口であり、意図的に再送を入れていない（ヘッダー契約は両方直すが、再送は
 *    意図的に片方だけ、という非対称性がある）。
 *
 * この理由を読まずに POST を再送対象へ広げると、上記のいずれかを悪化させる。
 *
 * `react-native` / `expo-*` を import しない（node の Vitest でそのままテストできる状態を保つ）。
 */

/** 再送判断の入力となる失敗の種類。 */
export type TransientFailure =
  | { kind: "status"; status: number }
  /** fetch 自体が失敗した（TypeError）。AbortError（DOMException）はここに含めない。 */
  | { kind: "network" };

export type TransientRetryInput = {
  /** リクエストの HTTP メソッド。未指定は GET 扱い。 */
  method: string | undefined;
  failure: TransientFailure;
  /** ここまでに実行した試行回数（初回リクエストを終えた時点で 1）。 */
  attempts: number;
};

/** 安価に失敗するもの（Lambda のスロットル・通信断）は3回まで。 */
const MAX_ATTEMPTS_CHEAP = 3;
/** 504 は CloudFront のオリジン待ち30秒を使い切った結果なので2回まで（合計60秒が上限）。 */
const MAX_ATTEMPTS_EXPENSIVE = 2;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 4000;
/** Retry-After が長すぎる場合の上限。これを超える指定は無視して通常のバックオフに倒す。 */
const MAX_RETRY_AFTER_MS = 10_000;

/** 再送しても副作用が増えないメソッドか（GET / HEAD のみ true）。 */
export function isSafeMethod(method: string | undefined): boolean {
  const normalized = (method ?? "GET").toUpperCase();
  return normalized === "GET" || normalized === "HEAD";
}

/** 失敗の種類ごとの最大試行回数（初回を含む）。 */
export function maxAttemptsFor(failure: TransientFailure): number {
  if (failure.kind === "network") {
    return MAX_ATTEMPTS_CHEAP;
  }
  if (failure.status === 429) {
    return MAX_ATTEMPTS_CHEAP;
  }
  if (failure.status === 502 || failure.status === 503 || failure.status === 504) {
    return MAX_ATTEMPTS_EXPENSIVE;
  }
  // 500 を含むその他のステータスは再送しない（アプリ層の決定的なエラー）。
  return 1;
}

/** 再送するか。 */
export function shouldRetryTransient(input: TransientRetryInput): boolean {
  return isSafeMethod(input.method) && input.attempts < maxAttemptsFor(input.failure);
}

/** `Retry-After` ヘッダ（秒数形式のみ）をミリ秒にする。解釈できなければ null。 */
export function parseRetryAfterMs(value: string | null | undefined): number | null {
  if (value === null || value === undefined || !/^\d+$/.test(value)) {
    // HTTP-date 形式・負値・非数値・空文字は null（誤った待ちを入れないため単純さを優先する）。
    return null;
  }
  const ms = Number(value) * 1000;
  return Math.min(ms, MAX_RETRY_AFTER_MS);
}

/** 次の再送までの待ち時間（ミリ秒）。 */
export function transientRetryDelayMs(
  attempts: number,
  options?: { retryAfter?: string | null; random?: () => number },
): number {
  const retryAfterMs = parseRetryAfterMs(options?.retryAfter);
  if (retryAfterMs !== null) {
    return retryAfterMs;
  }
  const random = options?.random ?? Math.random;
  const base = Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS);
  // full jitter: 0.5〜1.0 倍の範囲でばらつかせる。
  return Math.round(base * (0.5 + 0.5 * random()));
}

/**
 * 再送を実際に回す薄いヘルパ。`send` は毎回新しい fetch を発行すること
 * （`Request` インスタンスは body が消費済みになるため再利用できない。`RequestInit` の使い回しはよい）。
 */
export async function sendWithTransientRetry(
  send: () => Promise<Response>,
  options: { method: string | undefined; sleep?: (ms: number) => Promise<void> },
): Promise<Response> {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let attempts = 0;

  for (;;) {
    attempts += 1;
    let response: Response;
    try {
      response = await send();
    } catch (error) {
      // AbortError は DOMException（TypeError ではない）なので、ここで自然に再送対象から外れる。
      // 画面離脱で中断したリクエストを掘り返さないため、この性質に依存してよい。
      if (
        error instanceof TypeError &&
        shouldRetryTransient({ method: options.method, failure: { kind: "network" }, attempts })
      ) {
        await sleep(transientRetryDelayMs(attempts));
        continue;
      }
      throw error;
    }

    if (
      shouldRetryTransient({
        method: options.method,
        failure: { kind: "status", status: response.status },
        attempts,
      })
    ) {
      await sleep(
        transientRetryDelayMs(attempts, { retryAfter: response.headers.get("Retry-After") }),
      );
      continue;
    }

    return response;
  }
}
