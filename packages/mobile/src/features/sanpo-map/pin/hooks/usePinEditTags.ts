import { useState } from "react";

import { usePinTagSuggestions } from "@/features/sanpo-map/pin/hooks/usePinTagSuggestions";
import {
  isDraftTagRemovable,
  type PinEditBaseline,
  type PinEditDraft,
} from "@/features/sanpo-map/pin/lib/pinEditDraft";
import {
  filterTagSuggestions,
  resolveTagLabelForAdd,
} from "@/features/sanpo-map/pin/lib/pinTagSuggestions";
import {
  addTag,
  addTagErrorMessage,
  removeTag as removeTagFrom,
} from "@/features/sanpo-map/pin/lib/pinTags";
import type { TagSuggestion } from "@/features/sanpo-map/pin/types";

export type UsePinEditTagsOptions = {
  isSignedIn: boolean;
  /** タグ候補を取る地図（選んでいる移動先。移動先の表記に揃う）。 */
  sanpoMapId: string | null;
  /** null = まだ詳細が取れていない。 */
  baseline: PinEditBaseline | null;
  draft: PinEditDraft;
  /** 下書きを変える入口（保存エラーの解除を含む）。 */
  updateDraft: (update: (prev: PinEditDraft) => PinEditDraft) => void;
  /** 既存のタグを外す権限（`canRemovePinTag` を文脈で束ねたもの）。 */
  canRemoveTagEntry: (tag: { createdByUserId: string }) => boolean;
};

export type UsePinEditTagsResult = {
  tagInput: string;
  setTagInput: (v: string) => void;
  tagError: string | null;
  tagSuggestions: TagSuggestion[];
  addTagFromInput: () => void;
  addTagFromSuggestion: (label: string) => void;
  removeTag: (label: string) => void;
  canRemoveTag: (label: string) => boolean;
};

/** ピン編集のタグ欄（入力・候補・追加・削除と権限）。判定は `pinTags`・`pinTagSuggestions`・`pinEditDraft` に委ねる。 */
export function usePinEditTags(options: UsePinEditTagsOptions): UsePinEditTagsResult {
  const { baseline, draft, updateDraft, canRemoveTagEntry } = options;
  const [tagInput, setTagInputState] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);

  const tagSuggestionsQuery = usePinTagSuggestions({
    sanpoMapId: options.sanpoMapId,
    enabled: options.isSignedIn,
  });
  const tagSuggestions = filterTagSuggestions({
    candidates: tagSuggestionsQuery.candidates,
    query: tagInput,
    attached: draft.tags,
  });

  const setTagInput = (v: string) => {
    setTagInputState(v);
    setTagError(null);
  };

  const applyAddTag = (label: string) => {
    const result = addTag(draft.tags, label);
    if (!result.ok) {
      setTagError(addTagErrorMessage(result.reason));
      return;
    }
    // 上限・重複の判定結果（error）は現在の下書きで見て、反映は updater で最新の tags に対して行う。
    updateDraft((prev) => {
      const latest = addTag(prev.tags, label);
      return latest.ok ? { ...prev, tags: latest.tags } : prev;
    });
    setTagInputState("");
    setTagError(null);
  };

  const addTagFromInput = () =>
    applyAddTag(resolveTagLabelForAdd(tagInput, tagSuggestionsQuery.candidates));
  const addTagFromSuggestion = (label: string) => applyAddTag(label);

  const canRemoveTag = (label: string) =>
    baseline === null ? true : isDraftTagRemovable(label, baseline, canRemoveTagEntry);

  const removeTag = (label: string) => {
    // UI でも出さないが、多層防御として権限の無いタグは外さない。
    if (!canRemoveTag(label)) return;
    updateDraft((prev) => ({ ...prev, tags: removeTagFrom(prev.tags, label) }));
  };

  return {
    tagInput,
    setTagInput,
    tagError,
    tagSuggestions,
    addTagFromInput,
    addTagFromSuggestion,
    removeTag,
    canRemoveTag,
  };
}
