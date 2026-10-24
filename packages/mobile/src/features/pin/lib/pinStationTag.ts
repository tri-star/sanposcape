import { resolveTagLabelForAdd } from "@/features/pin/lib/pinTagSuggestions";
import { addTag } from "@/features/pin/lib/pinTags";
import type { TagSuggestion } from "@/features/pin/types";

/**
 * 登録画面に最初から入れておく最寄り駅のタグ（SS-225）の状態。
 * auto = 取れたら入れる、dismissed = 利用者が外したので、その画面では入れ直さない（位置を調整しても）。
 */
export type StationTagState = "auto" | "dismissed";

/**
 * いまタグ欄に入れておく駅のタグ。入れないなら null。
 *
 * 利用者が入力したタグ（`userTags`）とは分けて持ち、ここで毎レンダー導く（effect で `userTags` に
 * 書き込まない）。位置を調整して駅が変わったら、外していない限り新しい駅に差し替わる。
 * 地図の既存のタグとキーで一致したら既存の表記に揃え（ADR-M-013 D4）、追加できない
 * （同じタグがある・上限に達している・表記が不正）なら入れない。
 */
export function resolveStationTag(input: {
  label: string | null;
  state: StationTagState;
  userTags: readonly string[];
  candidates: readonly TagSuggestion[];
}): string | null {
  if (input.state === "dismissed" || input.label === null) return null;
  const result = addTag(input.userTags, resolveTagLabelForAdd(input.label, input.candidates));
  if (!result.ok) return null;
  return result.tags[result.tags.length - 1] ?? null;
}

/** タグ欄に出し、保存で送るタグ。駅のタグは先頭に置く。 */
export function mergeStationTag(userTags: readonly string[], stationTag: string | null): string[] {
  return stationTag === null ? [...userTags] : [stationTag, ...userTags];
}
