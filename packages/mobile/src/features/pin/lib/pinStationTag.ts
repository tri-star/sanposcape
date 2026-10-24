import { resolveTagLabelForAdd } from "@/features/pin/lib/pinTagSuggestions";
import { addTag } from "@/features/pin/lib/pinTags";
import type { TagSuggestion } from "@/features/pin/types";

/**
 * 登録画面で最初に最寄り駅が取れたとき、駅のタグを1回だけ足した後のタグ（SS-225）。足さないなら null。
 *
 * 足した後は普通のタグと同じに扱う（外す・位置を調整しても入れ直さない・差し替えない）。
 * 地図の既存のタグとキーで一致したら既存の表記に揃え（ADR-M-013 D4）、追加できない
 * （利用者が同じタグを入れている・上限に達している・表記が不正）なら足さない。
 */
export function addStationTag(input: {
  tags: readonly string[];
  label: string;
  candidates: readonly TagSuggestion[];
}): string[] | null {
  const result = addTag(input.tags, resolveTagLabelForAdd(input.label, input.candidates));
  return result.ok ? result.tags : null;
}
