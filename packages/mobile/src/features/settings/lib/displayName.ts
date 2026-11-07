import { isApiError } from "@/api/apiError";

/** backend の `DISPLAY_NAME_MAX_LENGTH`（`users/display_name.py`）と一致させる（code point 数。SS-268）。 */
export const DISPLAY_NAME_MAX_LENGTH = 50;

export type DisplayNameInvalidReason = "empty" | "too_long" | "forbidden_characters";

export type DisplayNameValidation =
  | { ok: true; displayName: string }
  | { ok: false; reason: DisplayNameInvalidReason };

/** 書式制御（Cf）のうち、絵文字の合字（ZWJ）と一部言語の表記（ZWNJ）に要るので許す code point。 */
const ALLOWED_FORMAT_CODE_POINTS = new Set([0x200c, 0x200d]);
/** backend と同じく、制御文字・書式制御文字・行区切り・段落区切りを入れさせない。 */
const FORBIDDEN_CATEGORY = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/**
 * 表示名の検証（SS-268）。backend の `DisplayNameUpdate` と同じ規則を端末で先に当て、
 * 保存ボタンを無効にする（backend も 422 で弾くので、ここは操作を早く返すためのもの）。
 *
 * trim（JS の trim は全角空白・NBSP も除く。backend の `str.strip()` と揃う）後に
 * 1〜50 code point（`Array.from` で数える。`TextInput` の `maxLength` は UTF-16 で数えるので使わない）。
 * 返す `displayName` は trim 済み。
 */
export function validateDisplayName(input: string): DisplayNameValidation {
  const displayName = input.trim();
  if (displayName === "") {
    return { ok: false, reason: "empty" };
  }
  const codePoints = Array.from(displayName);
  if (codePoints.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  const hasForbidden = codePoints.some(
    (ch) => FORBIDDEN_CATEGORY.test(ch) && !ALLOWED_FORMAT_CODE_POINTS.has(ch.codePointAt(0) ?? 0),
  );
  if (hasForbidden) {
    return { ok: false, reason: "forbidden_characters" };
  }
  return { ok: true, displayName };
}

/** 入力欄の下に出す文言。empty は文言を出さず保存ボタンを無効にするだけ。 */
export function displayNameErrorMessage(reason: DisplayNameInvalidReason): string | null {
  switch (reason) {
    case "too_long":
      return `表示名は${DISPLAY_NAME_MAX_LENGTH}文字までです`;
    case "forbidden_characters":
      return "改行や見えない文字は使えません";
    case "empty":
      return null;
  }
}

/** 未設定（null）のときに設定画面へ出す名前。メンバー一覧（`sanpoMapMember.ts`）の「メンバー」とは別に持つ。 */
export const DISPLAY_NAME_UNSET_LABEL = "未設定";

/** `PATCH /users/me` の失敗分類（feature 境界をまたいで型を共有しない）。 */
export type DisplayNameUpdateErrorCode =
  | "invalid" // 422（端末の検証を通ったのに backend が弾いた）
  | "unauthorized" // 401
  | "network" // TypeError（fetch 失敗）
  | "server" // 5xx
  | "unknown";

/** 任意の例外を分類する（`accountDeleteError.ts` と同じく、status は `isApiError()` で見る）。 */
export function toDisplayNameUpdateErrorCode(error: unknown): DisplayNameUpdateErrorCode {
  if (isApiError(error)) {
    if (error.status >= 500) return "server";
    if (error.status === 401) return "unauthorized";
    if (error.status === 422) return "invalid";
    return "unknown";
  }
  if (error instanceof TypeError) {
    return "network";
  }
  return "unknown";
}

/** 保存に失敗したときにダイアログへ出す文言。 */
export function displayNameUpdateErrorMessage(code: DisplayNameUpdateErrorCode): string {
  switch (code) {
    case "invalid":
      return "この表示名は使えません。別の名前にしてください。";
    case "unauthorized":
      return "サインインの有効期限が切れました。サインインし直してください。";
    case "network":
      return "通信できませんでした。電波の良い場所でもう一度お試しください。";
    case "server":
    case "unknown":
      return "保存できませんでした。時間をおいてもう一度お試しください。";
  }
}
