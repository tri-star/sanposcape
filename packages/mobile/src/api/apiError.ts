/** HTTP ステータスを保持したエラー。401 判定に必要。 */
export class ApiError extends Error {
  /** instanceof が Hermes/トランスパイル環境で不安定になるのを避けるためのブランド。 */
  readonly isApiError = true;

  constructor(
    readonly status: number,
    message?: string,
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
