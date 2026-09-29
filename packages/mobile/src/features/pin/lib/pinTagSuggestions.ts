import type { SanpoMapTagRead } from "@/api/generated/model";
import { PIN_TAGS_MAX_COUNT } from "@/features/pin/lib/pinLimits";
import {
  addTag,
  isTagLabelWithinMaxLength,
  normalizeTagLabel,
  tagKey,
} from "@/features/pin/lib/pinTags";
import { resolveEffectiveSanpoMapSelection } from "@/features/pin/lib/sanpoMapChoices";
import type { SanpoMap, SanpoMapSelection, TagSuggestion } from "@/features/pin/types";

/** 1回の取得件数（backend の最大 200 以下。地図1枚のタグの種類はこれで足りる想定）。 */
export const PIN_TAG_SUGGESTIONS_FETCH_LIMIT = 100;
/** 画面に出す候補の最大数（入力が空でも絞り込み中でも同じ）。 */
export const PIN_TAG_SUGGESTIONS_VISIBLE_MAX = 6;

/**
 * API のレスポンスを候補に整形する。表記を正規化し、空・長すぎるものと `tagKey` の重複
 * （先勝ち）を捨てる。順序は backend の並び（よく使う順）をそのまま保つ。
 */
export function toTagSuggestions(items: readonly SanpoMapTagRead[]): TagSuggestion[] {
  const seen = new Set<string>();
  const result: TagSuggestion[] = [];
  for (const item of items) {
    const label = normalizeTagLabel(item.label);
    if (label === "" || !isTagLabelWithinMaxLength(label)) continue;
    const key = tagKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ label, pinCount: item.pin_count });
  }
  return result;
}

/**
 * 候補を取る地図の id。地図一覧が未取得、または既定地図がまだ無いときは null（取得しない）。
 * 選んでいた地図が一覧から消えたときは既定地図に戻す（`resolveEffectiveSanpoMapSelection`。
 * `resolveSanpoMapChoices` と同じ解決を共用する）。
 */
export function resolveTagSuggestionSanpoMapId(input: {
  status: "loading" | "ready" | "error";
  maps: readonly SanpoMap[];
  selection: SanpoMapSelection;
}): string | null {
  if (input.status !== "ready") return null;
  const selection = resolveEffectiveSanpoMapSelection(input);
  if (selection.kind === "existing") return selection.sanpoMapId;
  return input.maps.find((m) => m.isDefault)?.id ?? null;
}

/**
 * 入力に応じて候補を絞り込む。付与済みは除き、上限到達時は空。
 * 入力が空ならよく使うタグ（先頭から）、あれば前方一致 → 部分一致の順。
 * かな・全半角の同一視はしない（backend の `label_key` と揃える）。
 */
export function filterTagSuggestions(input: {
  candidates: readonly TagSuggestion[];
  query: string;
  attached: readonly string[];
}): TagSuggestion[] {
  if (input.attached.length >= PIN_TAGS_MAX_COUNT) return [];
  const attachedKeys = new Set(input.attached.map(tagKey));
  const available = input.candidates.filter((c) => !attachedKeys.has(tagKey(c.label)));
  const key = tagKey(input.query);
  if (key === "") {
    return available.slice(0, PIN_TAG_SUGGESTIONS_VISIBLE_MAX);
  }
  const prefix: TagSuggestion[] = [];
  const partial: TagSuggestion[] = [];
  for (const candidate of available) {
    const candidateKey = tagKey(candidate.label);
    if (candidateKey.startsWith(key)) prefix.push(candidate);
    else if (candidateKey.includes(key)) partial.push(candidate);
  }
  return [...prefix, ...partial].slice(0, PIN_TAG_SUGGESTIONS_VISIBLE_MAX);
}

/**
 * 追加するときの表記。既存の候補と `tagKey` が一致すればその表記に揃える
 * （表記ゆれの収束）。一致しなければ入力のまま（正規化は `addTag` が行う）。
 */
export function resolveTagLabelForAdd(query: string, candidates: readonly TagSuggestion[]): string {
  const key = tagKey(query);
  return candidates.find((c) => tagKey(c.label) === key)?.label ?? query;
}

/** 送信キーの動作。空なら追加せずキーボードを閉じるだけ（エラーを出さない）。 */
export function resolveTagSubmitAction(query: string): "add" | "dismiss" {
  return normalizeTagLabel(query) === "" ? "dismiss" : "add";
}

/**
 * `label` を追加すると上限（10個）に達するか。達するなら追加後に入力欄が無効になるので、
 * フォーカスが残ってキーボードだけ開いたままになるのを避けるために呼び出し側が閉じる。
 * 追加できない入力（空・重複・長すぎ・すでに上限）は追加されないので false。
 */
export function reachesTagLimitAfterAdd(tags: readonly string[], label: string): boolean {
  const result = addTag(tags, label);
  return result.ok && result.tags.length >= PIN_TAGS_MAX_COUNT;
}

/**
 * 入力欄の `submitBehavior`。文字があれば追加してキーボードを開いたまま（続けて入力できる）、
 * 空なら閉じるだけ、この追加で上限に達するなら閉じる。
 */
export function resolveTagSubmitBehavior(input: {
  query: string;
  tags: readonly string[];
}): "submit" | "blurAndSubmit" {
  if (resolveTagSubmitAction(input.query) === "dismiss") return "blurAndSubmit";
  return reachesTagLimitAfterAdd(input.tags, input.query) ? "blurAndSubmit" : "submit";
}

export function tagSuggestionHeading(query: string): string {
  return normalizeTagLabel(query) === "" ? "よく使うタグ" : "候補";
}
