/**
 * 設定画面の「バージョン」行の文言（SS-228）。`.tsx` は Vitest 対象外なので、文言の決定だけをこの純粋な `lib` に出す
 * （先例: `accountDeleteCopy.ts`）。
 */

/** 「バージョン」行のラベル。 */
export const APP_VERSION_LABEL = "バージョン";

/** バージョンを読めなかったときの表示。行ごと消すと「どこにあるか」を案内できなくなるので、行は残す。 */
export const APP_VERSION_UNKNOWN = "不明";

/**
 * 表示するバージョン文字列。`version` はそのまま出す（接頭辞 `v` やビルド番号は付けない）。
 * `null`・空白だけのときは「不明」。
 */
export function formatAppVersion(version: string | null): string {
  if (version === null) return APP_VERSION_UNKNOWN;
  const trimmed = version.trim();
  return trimmed === "" ? APP_VERSION_UNKNOWN : trimmed;
}
