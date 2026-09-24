import { describe, expect, it } from "vitest";

import {
  hasUnsavedInput,
  resolveSaveAvailability,
  saveUnavailableMessage,
  validatePinDraftFields,
} from "@/features/pin/lib/pinDraftValidation";
import { PIN_MEMO_MAX_LENGTH, PIN_NAME_MAX_LENGTH } from "@/features/pin/lib/pinLimits";
import type { PinDraft } from "@/features/pin/types";

const BASE_DRAFT: PinDraft = {
  name: "",
  memo: "",
  tags: [],
  sanpoMapSelection: { kind: "default" },
};

describe("validatePinDraftFields", () => {
  it("空欄は両方 OK", () => {
    expect(validatePinDraftFields({ name: "", memo: "" })).toEqual({ name: null, memo: null });
  });

  it(`名前 ${PIN_NAME_MAX_LENGTH} 文字は OK、${PIN_NAME_MAX_LENGTH + 1} 文字はエラー`, () => {
    expect(
      validatePinDraftFields({ name: "あ".repeat(PIN_NAME_MAX_LENGTH), memo: "" }).name,
    ).toBeNull();
    expect(
      validatePinDraftFields({ name: "あ".repeat(PIN_NAME_MAX_LENGTH + 1), memo: "" }).name,
    ).not.toBeNull();
  });

  it(`メモ ${PIN_MEMO_MAX_LENGTH} 文字は OK、${PIN_MEMO_MAX_LENGTH + 1} 文字はエラー`, () => {
    expect(
      validatePinDraftFields({ name: "", memo: "あ".repeat(PIN_MEMO_MAX_LENGTH) }).memo,
    ).toBeNull();
    expect(
      validatePinDraftFields({ name: "", memo: "あ".repeat(PIN_MEMO_MAX_LENGTH + 1) }).memo,
    ).not.toBeNull();
  });

  it("前後の空白は trim してから数える", () => {
    const padded = `  ${"あ".repeat(PIN_NAME_MAX_LENGTH)}  `;
    expect(validatePinDraftFields({ name: padded, memo: "" }).name).toBeNull();
  });
});

describe("resolveSaveAvailability", () => {
  it("判定順: saving > field_error > photos_preparing > photos_failed", () => {
    expect(
      resolveSaveAvailability({
        fieldErrors: { name: "エラー", memo: null },
        photos: [{ status: "processing" }],
        isSaving: true,
      }),
    ).toEqual({ canSave: false, reason: "saving" });

    expect(
      resolveSaveAvailability({
        fieldErrors: { name: "エラー", memo: null },
        photos: [{ status: "processing" }],
        isSaving: false,
      }),
    ).toEqual({ canSave: false, reason: "field_error" });

    expect(
      resolveSaveAvailability({
        fieldErrors: { name: null, memo: null },
        photos: [{ status: "processing" }, { status: "failed" }],
        isSaving: false,
      }),
    ).toEqual({ canSave: false, reason: "photos_preparing" });

    expect(
      resolveSaveAvailability({
        fieldErrors: { name: null, memo: null },
        photos: [{ status: "failed" }],
        isSaving: false,
      }),
    ).toEqual({ canSave: false, reason: "photos_failed" });
  });

  it("写真0枚は canSave: true", () => {
    expect(
      resolveSaveAvailability({
        fieldErrors: { name: null, memo: null },
        photos: [],
        isSaving: false,
      }),
    ).toEqual({ canSave: true });
  });

  it("waiting / uploading / uploaded が混在していても canSave: true（改訂2）", () => {
    expect(
      resolveSaveAvailability({
        fieldErrors: { name: null, memo: null },
        photos: [
          { status: "waiting" },
          { status: "uploading" },
          { status: "uploaded" },
          { status: "attached" },
        ],
        isSaving: false,
      }),
    ).toEqual({ canSave: true });
  });
});

describe("saveUnavailableMessage", () => {
  it("saving / field_error は null（別の場所で表示するため）", () => {
    expect(saveUnavailableMessage("saving")).toBeNull();
    expect(saveUnavailableMessage("field_error")).toBeNull();
  });

  it("photos_preparing / photos_failed に文言がある", () => {
    expect(saveUnavailableMessage("photos_preparing")).not.toBeNull();
    expect(saveUnavailableMessage("photos_failed")).not.toBeNull();
  });
});

describe("hasUnsavedInput", () => {
  it("すべて空なら false", () => {
    expect(hasUnsavedInput(BASE_DRAFT, 0)).toBe(false);
  });

  it("name / memo / tags / 写真 / 地図選択のいずれかがあれば true", () => {
    expect(hasUnsavedInput({ ...BASE_DRAFT, name: "桜" }, 0)).toBe(true);
    expect(hasUnsavedInput({ ...BASE_DRAFT, memo: "メモ" }, 0)).toBe(true);
    expect(hasUnsavedInput({ ...BASE_DRAFT, tags: ["タグ"] }, 0)).toBe(true);
    expect(hasUnsavedInput(BASE_DRAFT, 1)).toBe(true);
    expect(
      hasUnsavedInput(
        { ...BASE_DRAFT, sanpoMapSelection: { kind: "existing", sanpoMapId: "id" } },
        0,
      ),
    ).toBe(true);
  });

  it("空白のみの name/memo は false 扱い", () => {
    expect(hasUnsavedInput({ ...BASE_DRAFT, name: "   ", memo: "  " }, 0)).toBe(false);
  });
});
