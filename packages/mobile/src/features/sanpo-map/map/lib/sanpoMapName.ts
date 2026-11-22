/** backend の SANPO_MAP_NAME_MAX_LENGTH と一致させる（code point 数）。 */
export const SANPO_MAP_NAME_MAX_LENGTH = 50;

export type SanpoMapNameValidation =
  | { ok: true; name: string }
  | { ok: false; reason: "empty" | "too_long" };

/**
 * 地図名の検証。trim（JS の trim は全角空白 U+3000・NBSP U+00A0 も除く。backend の
 * `str.strip()` と揃う）後に 1〜50 code point（`Array.from` で数える。`normalize` は使わない）。
 * 返す `name` は trim 済み。
 */
export function validateSanpoMapName(input: string): SanpoMapNameValidation {
  const name = input.trim();
  if (name === "") {
    return { ok: false, reason: "empty" };
  }
  if (Array.from(name).length > SANPO_MAP_NAME_MAX_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, name };
}

/** 入力欄の下に出す文言。empty は文言を出さず作成ボタンを無効にするだけ。 */
export function sanpoMapNameErrorMessage(reason: "empty" | "too_long"): string | null {
  return reason === "too_long" ? `地図の名前は${SANPO_MAP_NAME_MAX_LENGTH}文字までです` : null;
}
