import { resolveTagLabelForAdd } from "@/features/pin/lib/pinTagSuggestions";
import { addTag, removeTag, tagKey } from "@/features/pin/lib/pinTags";
import type { TagSuggestion } from "@/features/pin/types";

/**
 * 登録画面に最初から入れておく最寄り駅のタグ（SS-225）の状態。
 * - `dismissed`: 利用者が駅のタグを外したので、その画面では駅のタグを入れ直さない（位置を調整して駅が変わっても）。
 * - `removedKeys`: 利用者が外したタグのキー。手で入れた同じ名前のタグを外したときも、
 *   自動で入れ直さないために使う（外した直後に同じタグが現れ、× が効かないように見えるのを防ぐ）。
 */
export type StationTagState = {
  dismissed: boolean;
  removedKeys: readonly string[];
};

export const INITIAL_STATION_TAG_STATE: StationTagState = { dismissed: false, removedKeys: [] };

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
  if (input.state.dismissed || input.label === null) return null;
  if (input.state.removedKeys.includes(tagKey(input.label))) return null;
  const result = addTag(input.userTags, resolveTagLabelForAdd(input.label, input.candidates));
  if (!result.ok) return null;
  return result.tags[result.tags.length - 1] ?? null;
}

/**
 * タグ欄の × を押したときの、利用者のタグと駅のタグの状態。
 * 外したのが画面に出ている駅のタグ（`stationTag`）なら駅のタグを入れ直さない状態にし、
 * 利用者のタグなら取り除く。どちらでも外したキーを覚え、同じ名前の駅のタグを自動で入れない。
 */
export function removeTagWithStation(input: {
  label: string;
  stationTag: string | null;
  userTags: readonly string[];
  state: StationTagState;
}): { userTags: string[]; state: StationTagState } {
  const key = tagKey(input.label);
  const removedKeys = input.state.removedKeys.includes(key)
    ? input.state.removedKeys
    : [...input.state.removedKeys, key];
  if (input.stationTag !== null && input.label === input.stationTag) {
    return { userTags: [...input.userTags], state: { dismissed: true, removedKeys } };
  }
  return {
    userTags: removeTag(input.userTags, input.label),
    state: { ...input.state, removedKeys },
  };
}

/** タグ欄に出し、保存で送るタグ。駅のタグは先頭に置く。 */
export function mergeStationTag(userTags: readonly string[], stationTag: string | null): string[] {
  return stationTag === null ? [...userTags] : [stationTag, ...userTags];
}
