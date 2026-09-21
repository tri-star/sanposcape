/**
 * HTTP ステータスを保持したエラー。401 判定に必要。
 *
 * `body`（PR #93 T15）: `customFetch` が非2xx 応答の本文を JSON として解釈できた場合にだけ
 * 入る（本文が無い・JSON でない場合は `undefined`）。後方互換のため既存の呼び出し側
 * （`new ApiError(status)` / `new ApiError(status, message)`）は変更不要。
 */
export class ApiError extends Error {
  /** instanceof が Hermes/トランスパイル環境で不安定になるのを避けるためのブランド。 */
  readonly isApiError = true;

  constructor(
    readonly status: number,
    message?: string,
    readonly body?: unknown,
  ) {
    super(message ?? `HTTP error! status: ${status}`);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isApiError?: boolean }).isApiError === true
  );
}

/**
 * 応答本文（JSON オブジェクト）に含まれる機械可読な `code`（文字列）を取り出す。
 * `ApiError` でない・本文が無い・`code` が文字列でない場合は null（PR #93 T15）。
 */
export function getApiErrorCode(error: unknown): string | null {
  if (!isApiError(error)) return null;
  const body = error.body;
  if (typeof body !== "object" || body === null || !("code" in body)) {
    return null;
  }
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}
