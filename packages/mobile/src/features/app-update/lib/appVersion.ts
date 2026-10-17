/**
 * アプリのバージョン（`X.Y.Z`）の解析と比較（SS-101）。純粋関数だけを置く（Vitest 対象）。
 *
 * 形式は backend の `core/feature_flags.py` の `_VERSION_PATTERN`（`^\d+\.\d+\.\d+$`）と同じ。
 * backend が形式不正を `null` に畳んで配るので、ここでの検査は防御のための二重チェック。
 */

type ParsedVersion = readonly [major: number, minor: number, patch: number];

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

/** `X.Y.Z` を数値の組にする。形式が違えば null（前後の空白・接頭辞 `v`・プレリリース表記も救済しない）。 */
export function parseAppVersion(raw: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(raw);
  if (match === null) return null;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  return parts.every(Number.isSafeInteger) ? parts : null;
}

/** 数値として比べる（`0.10.0` > `0.9.0`）。負なら a < b、0 なら等しい、正なら a > b。 */
export function compareAppVersions(a: ParsedVersion, b: ParsedVersion): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * 実行中のアプリが最低サポートバージョンを下回っているか。
 *
 * どちらかが `null`・形式不正なら false（= アップデートを強制しない）。`/app-config` の
 * `null`（最低バージョンの指定なし・AppConfig を読めない）と同じ安全側に倒す（ADR-008 追補 D1）。
 * 誤って全端末をふさぐより、古い端末を一時的に通す方が回復しやすいため。
 */
export function isBelowMinimumVersion(input: {
  currentVersion: string | null;
  minimumVersion: string | null;
}): boolean {
  if (input.currentVersion === null || input.minimumVersion === null) return false;
  const current = parseAppVersion(input.currentVersion);
  const minimum = parseAppVersion(input.minimumVersion);
  if (current === null || minimum === null) return false;
  return compareAppVersions(current, minimum) < 0;
}
