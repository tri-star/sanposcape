/**
 * 端末側の診断ログ。
 *
 * **なぜ必要か**: 写真の直送（presigned POST）は端末 → S3 で完結し backend を通らないため、
 * 失敗しても CloudWatch Logs にも S3 のデータイベントにも痕跡が残らない。さらに
 * `photoUploadError.ts` はほぼ全ての失敗を同じ文言（「アップロードに失敗しました」）へ
 * 潰すので、端末で何が起きたのかを知る手段が実質ゼロだった（SS-88/SS-106 の実機調査）。
 *
 * 出力先は `console.warn`（Metro のコンソール、Android は `adb logcat -s ReactNativeJS`、
 * iOS は Xcode/Console.app で読める）。将来 Sentry 等を導入したら、この1関数の中身を
 * 差し替えれば呼び出し側は変えなくてよい——という形を保つこと（呼び出し側で直接
 * `console.*` を使わない理由）。
 *
 * ★ 機密を渡さないこと。特に presigned POST の `fields` の**値**は policy・署名・
 *   一時認証情報を含むため、名前（キー）だけを渡す。
 */
export function logDiagnostic(event: string, detail: Record<string, unknown>): void {
  console.warn(`[sanposcape] ${event}`, detail);
}

/**
 * 任意の例外から、ログに載せてよい最小限の情報（種別とメッセージ）を取り出す。
 *
 * `name` を必ず載せるのが肝心で、RN の `fetch` 失敗（`TypeError: Network request failed`）・
 * 中断（`AbortError`）・`usePinPhotos` のタイムアウト（`TypeError: Pin photo transfer
 * timed out`）は、分類後のコード（どれも "network"）では区別できない。
 */
export function describeError(error: unknown): { errorName: string; errorMessage: string } {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorName: typeof error, errorMessage: String(error) };
}
