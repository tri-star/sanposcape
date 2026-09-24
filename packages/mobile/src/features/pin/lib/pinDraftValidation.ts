import { PIN_MEMO_MAX_LENGTH, PIN_NAME_MAX_LENGTH } from "@/features/pin/lib/pinLimits";
import type { PhotoDraftItem, PinDraft, SanpoMapSelection } from "@/features/pin/types";

export type PinDraftFieldErrors = { name: string | null; memo: string | null };

/** 名前・メモの文字数バリデーション（trim 後 code point 数）。空は OK（両方とも任意項目）。 */
export function validatePinDraftFields(
  draft: Pick<PinDraft, "name" | "memo">,
): PinDraftFieldErrors {
  const name =
    Array.from(draft.name.trim()).length > PIN_NAME_MAX_LENGTH
      ? `名前は${PIN_NAME_MAX_LENGTH}文字までです`
      : null;
  const memo =
    Array.from(draft.memo.trim()).length > PIN_MEMO_MAX_LENGTH
      ? `メモは${PIN_MEMO_MAX_LENGTH}文字までです`
      : null;
  return { name, memo };
}

export type SaveAvailability =
  | { canSave: true }
  | { canSave: false; reason: "field_error" | "photos_preparing" | "photos_failed" | "saving" };

/**
 * 保存可否の判定。優先順位: saving > field_error > photos_preparing > photos_failed。
 *
 * waiting / uploading / uploaded は保存を妨げない（改訂 2。保存フローが待機写真の送信と
 * 紐付けを引き受けるため）。止めるのは端末での加工中（processing。prepared が無いと送れない。
 * 1枚あたり1秒未満）と failed（ユーザーの判断が要る）だけ。
 */
export function resolveSaveAvailability(input: {
  fieldErrors: PinDraftFieldErrors;
  photos: readonly Pick<PhotoDraftItem, "status">[];
  isSaving: boolean;
}): SaveAvailability {
  if (input.isSaving) {
    return { canSave: false, reason: "saving" };
  }
  if (input.fieldErrors.name !== null || input.fieldErrors.memo !== null) {
    return { canSave: false, reason: "field_error" };
  }
  if (input.photos.some((photo) => photo.status === "processing")) {
    return { canSave: false, reason: "photos_preparing" };
  }
  if (input.photos.some((photo) => photo.status === "failed")) {
    return { canSave: false, reason: "photos_failed" };
  }
  return { canSave: true };
}

const SAVE_UNAVAILABLE_MESSAGES: Record<
  Exclude<SaveAvailability, { canSave: true }>["reason"],
  string | null
> = {
  saving: null,
  field_error: null,
  photos_preparing: "写真を準備しています…",
  photos_failed: "送れない写真があります。再試行するか削除してください",
};

export function saveUnavailableMessage(
  reason: Exclude<SaveAvailability, { canSave: true }>["reason"],
): string | null {
  return SAVE_UNAVAILABLE_MESSAGES[reason];
}

function isDefaultSelection(selection: SanpoMapSelection): boolean {
  return selection.kind === "default";
}

/** 破棄確認ダイアログを出すべきか（何か1つでも「消えると困る」入力があるか）。 */
export function hasUnsavedInput(draft: PinDraft, photoCount: number): boolean {
  return (
    draft.name.trim().length > 0 ||
    draft.memo.trim().length > 0 ||
    draft.tags.length > 0 ||
    photoCount > 0 ||
    !isDefaultSelection(draft.sanpoMapSelection)
  );
}
