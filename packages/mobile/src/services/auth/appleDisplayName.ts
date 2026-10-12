import type { PendingAppleDisplayName } from "@/services/auth/types";

/** backend の `SESSION_DISPLAY_NAME_MAX_LENGTH`（users.display_name の列幅）。Python の len と同じくコードポイントで数える。 */
export const APPLE_DISPLAY_NAME_MAX_LENGTH = 255;

type NameComponents = {
  namePrefix: string | null;
  givenName: string | null;
  middleName: string | null;
  familyName: string | null;
  nameSuffix: string | null;
  nickname: string | null;
};

const ZWJ = "\u200D";
const ZWNJ = "\u200C";

/**
 * 禁止文字（Cc・Cf・Zl・Zp）にマッチする正規表現。
 * Hermes が `\p{}` を解釈できなかった場合でも起動を壊さないよう、リテラルではなく try/catch で作る。
 * 作れなかったときは文字の除去を諦め、trim・切り詰めだけに落とす（backend の 422 は
 * `appleSession.ts` が氏名を外して再送するのでサインインは止まらない）。
 */
const FORBIDDEN_CHARS: RegExp | null = (() => {
  try {
    return new RegExp("[\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}]", "gu");
  } catch {
    return null;
  }
})();

function hasContent(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/** 氏名の各要素のどれかに中身があるか（formatFullName を呼ぶかの判定）。 */
export function hasAnyNameComponent(fullName: NameComponents | null): boolean {
  if (fullName === null) return false;
  return [
    fullName.namePrefix,
    fullName.givenName,
    fullName.middleName,
    fullName.familyName,
    fullName.nameSuffix,
    fullName.nickname,
  ].some(hasContent);
}

/** formatFullName が使えないときの代替。givenName と familyName を半角スペースで連結（空要素は除く）。 */
export function joinNameComponents(fullName: {
  givenName: string | null;
  familyName: string | null;
}): string {
  return [fullName.givenName, fullName.familyName].filter(hasContent).join(" ");
}

/**
 * backend に送れる形に整える。送れない（空になる）なら null。
 * 1) 禁止文字（Cc・Cf・Zl・Zp。ただし ZWJ・ZWNJ は残す）を取り除く
 * 2) 前後の空白を除く（全角スペースも除かれる）
 * 3) コードポイントで 255 を超えたら切り詰め、もう一度 trim
 * 4) 空なら null
 */
export function sanitizeAppleDisplayName(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  let result = value;
  if (FORBIDDEN_CHARS !== null) {
    result = result.replace(FORBIDDEN_CHARS, (ch) => (ch === ZWJ || ch === ZWNJ ? ch : ""));
  }
  result = result.trim();
  const codePoints = Array.from(result);
  if (codePoints.length > APPLE_DISPLAY_NAME_MAX_LENGTH) {
    result = codePoints.slice(0, APPLE_DISPLAY_NAME_MAX_LENGTH).join("").trim();
  }
  return result === "" ? null : result;
}

/** SecureStore に保存した JSON を読む。形が違う・JSON でない・空文字の項目があるなら null（throw しない）。 */
export function parsePendingAppleDisplayName(raw: string | null): PendingAppleDisplayName | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { appleUserId, displayName } = parsed as Record<string, unknown>;
    if (typeof appleUserId !== "string" || appleUserId === "") return null;
    if (typeof displayName !== "string" || displayName === "") return null;
    return { appleUserId, displayName };
  } catch {
    return null;
  }
}

/** 保存用の JSON 文字列。 */
export function serializePendingAppleDisplayName(value: PendingAppleDisplayName): string {
  return JSON.stringify({ appleUserId: value.appleUserId, displayName: value.displayName });
}
