import { PIN_TAGS_MAX_COUNT, PIN_TAG_MAX_LENGTH } from "@/features/pin/lib/pinLimits";

export type AddTagResult =
  | { ok: true; tags: string[] }
  | { ok: false; reason: "empty" | "too_long" | "duplicate" | "limit" };

const LEADING_HASH_PATTERN = /^[#＃]+/;
const WHITESPACE_PATTERN = /\s+/g;

/**
 * trim・連続空白を1つに圧縮・先頭の `#`/`＃` を除去する。
 * backend `pins/tag_labels.py` の `normalize_tag_label` と同じ規則（ケース表も揃える。
 * backend-plan.md 10章）。二重防御として backend も同じ正規化・重複除去を行う。
 */
export function normalizeTagLabel(input: string): string {
  let value = input.trim();
  value = value.replace(LEADING_HASH_PATTERN, "");
  value = value.trim();
  return value.replace(WHITESPACE_PATTERN, " ");
}

/** 重複判定キー（正規化 + 小文字化）。backend の `tag_key` と同じ。 */
function tagKey(label: string): string {
  return normalizeTagLabel(label).toLowerCase();
}

/**
 * タグを1件追加する。長さは Unicode code point 単位（`Array.from` で数える。
 * `String.prototype.normalize` は使わない）。
 */
export function addTag(tags: readonly string[], input: string): AddTagResult {
  const normalized = normalizeTagLabel(input);
  if (normalized.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (Array.from(normalized).length > PIN_TAG_MAX_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  if (tags.length >= PIN_TAGS_MAX_COUNT) {
    return { ok: false, reason: "limit" };
  }
  const key = tagKey(normalized);
  if (tags.some((tag) => tagKey(tag) === key)) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true, tags: [...tags, normalized] };
}

export function removeTag(tags: readonly string[], label: string): string[] {
  return tags.filter((tag) => tag !== label);
}

const ADD_TAG_ERROR_MESSAGES: Record<Extract<AddTagResult, { ok: false }>["reason"], string> = {
  empty: "タグを入力してください",
  too_long: `タグは${PIN_TAG_MAX_LENGTH}文字までです`,
  duplicate: "同じタグがすでにあります",
  limit: `タグは${PIN_TAGS_MAX_COUNT}個までです`,
};

export function addTagErrorMessage(reason: Extract<AddTagResult, { ok: false }>["reason"]): string {
  return ADD_TAG_ERROR_MESSAGES[reason];
}
