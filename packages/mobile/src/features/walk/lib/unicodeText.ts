/** backend の destination.name 上限と揃える Unicode code point 数。 */
export const DESTINATION_NAME_MAX_LENGTH = 256;

/**
 * 文字列を先頭から最大 code point 数まで切り詰める。
 *
 * `for...of` は Unicode code point 単位で反復するため surrogate pair を分断しない。
 * 上限に達した時点で反復を停止し、長大な入力全体を配列化しない。
 */
export function truncateUnicodeCodePoints(value: string, maximumLength: number): string {
  if (!Number.isFinite(maximumLength) || maximumLength <= 0) return "";

  let result = "";
  let length = 0;

  for (const codePoint of value) {
    if (length === maximumLength) break;
    result += codePoint;
    length += 1;
  }

  return result;
}
