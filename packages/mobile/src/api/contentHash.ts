import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";

/**
 * ボディの SHA-256 を計算して `x-amz-content-sha256` を付与する。
 *
 * なぜ必要か: CloudFront(OAC) はオリジン(Lambda Function URL, AuthType=AWS_IAM)への SigV4 署名を
 * `SigningBehavior: always` で行うが、**ボディのハッシュは CloudFront が計算しない**。
 * 一方 `x-amz-content-sha256` は他の `x-amz-*` と異なり CloudFront が上書きしないため、
 * ビューア（mobile）が計算した値がそのまま署名対象になる。付けないと Lambda は
 * 署名なしペイロード(`UNSIGNED-PAYLOAD`)を受け付けず `InvalidSignatureException` (403) になる。
 *
 * ローカル(localhost 直結)でも同じ経路を通す方針（環境による分岐は持たない）。
 * localhost の FastAPI はこのヘッダーを無視するだけで副作用が無い。
 *
 * 参照: `docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md` 決定4
 */

/** CloudFront(OAC) がオリジンへの SigV4 署名に使うボディハッシュのヘッダー名。 */
export const CONTENT_SHA256_HEADER = "x-amz-content-sha256";

/** 空文字列の SHA-256（16進小文字）。SigV4 は空ボディでもこの値を要求する。 */
export const EMPTY_BODY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/**
 * ハッシュ対象の本文を決める純粋関数。null は「ヘッダーを付けない」を意味する。
 *
 * GET/HEAD はボディを持てないため CloudFront 側で完結する（null を返す）。
 * body が未指定/null の POST・DELETE などは空文字列のハッシュを送る（SigV4 の意味論そのまま）。
 * string 以外の body（FormData / Blob / ReadableStream 等）は現状 mobile に存在しない経路だが、
 * 誤ったハッシュを黙って送ると原因不明の 403 になるため、対応するまでは TypeError で落とす。
 */
export function contentHashTarget(options: RequestInit): string | null {
  const method = (options.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") {
    return null;
  }

  const body = options.body;
  if (body === undefined || body === null) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }

  throw new TypeError(
    `x-amz-content-sha256 を計算できない body 型です（string 以外は未対応）: ${Object.prototype.toString.call(body)}`,
  );
}

/** x-amz-content-sha256 を付けた新しい RequestInit を返す（元の options は破壊しない）。 */
export async function withContentHashHeader(options: RequestInit): Promise<RequestInit> {
  const target = contentHashTarget(options);
  if (target === null) {
    return options;
  }

  const digest =
    target === ""
      ? EMPTY_BODY_SHA256
      : (await digestStringAsync(CryptoDigestAlgorithm.SHA256, target)).toLowerCase();

  // Headers インスタンス / Record<string,string> / [string,string][] のいずれも正規化できる。
  const headers = new Headers(options.headers);
  headers.set(CONTENT_SHA256_HEADER, digest);

  // 元の options を破壊しない（リトライ時に同じ options を再利用するため必須）。
  return { ...options, headers };
}
