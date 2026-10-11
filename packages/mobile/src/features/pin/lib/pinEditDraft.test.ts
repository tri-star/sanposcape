import { describe, expect, it } from "vitest";

import {
  buildPinUpdateRequest,
  createPinEditBaseline,
  hasUnsavedPinEdit,
  initialPinEditDraft,
  isDraftTagRemovable,
  isEmptyPinUpdate,
  resolvePinEditSaveAvailability,
  togglePhotoDeletion,
  type PinEditBaseline,
  type PinEditDraft,
} from "@/features/pin/lib/pinEditDraft";
import type { PhotoDraftStatus, PinDetail, PinTagView } from "@/features/pin/types";

const TAG_A: PinTagView = { id: "tag-a", label: "Cafe", createdByUserId: "me" };
const TAG_B: PinTagView = { id: "tag-b", label: "桜", createdByUserId: "other" };

const PIN: PinDetail = {
  id: "pin-1",
  name: "旧名前",
  memo: "旧メモ",
  location: { latitude: 0, longitude: 0 },
  sanpoMapId: "map-1",
  createdByUserId: "me",
  tags: [TAG_A, TAG_B],
  photos: [],
  photoCount: 0,
  sanpoMapName: "地図",
  createdAt: "2026-01-01T00:00:00.000Z",
  visited: false,
  archived: false,
};

const BASELINE = createPinEditBaseline(PIN);

function build(
  patch: Partial<PinEditDraft>,
  options: {
    baseline?: PinEditBaseline;
    canEditFields?: boolean;
    canEditVisited?: boolean;
    canArchive?: boolean;
    canChangeSanpoMap?: boolean;
    canRemoveTag?: (tag: PinTagView) => boolean;
  } = {},
) {
  const baseline = options.baseline ?? BASELINE;
  return buildPinUpdateRequest({
    baseline,
    draft: { ...initialPinEditDraft(baseline), ...patch },
    permissions: {
      canEditFields: options.canEditFields ?? true,
      canEditVisited: options.canEditVisited ?? true,
      canArchive: options.canArchive ?? true,
      canChangeSanpoMap: options.canChangeSanpoMap ?? true,
    },
    canRemoveTag: options.canRemoveTag ?? (() => true),
  });
}

describe("createPinEditBaseline / initialPinEditDraft", () => {
  it("null の name / memo は空文字に直し、下書きは基準のラベルで始まる", () => {
    const baseline = createPinEditBaseline({ ...PIN, name: null, memo: null });
    expect(baseline.name).toBe("");
    expect(baseline.memo).toBe("");
    expect(initialPinEditDraft(BASELINE)).toEqual({
      name: "旧名前",
      memo: "旧メモ",
      visited: false,
      archived: false,
      sanpoMapId: "map-1",
      tags: ["Cafe", "桜"],
      photoIdsToDelete: [],
    });
  });

  it("visited / archived は詳細から基準値と下書きに写る", () => {
    const baseline = createPinEditBaseline({ ...PIN, visited: true, archived: true });
    expect(baseline).toMatchObject({ visited: true, archived: true });
    expect(initialPinEditDraft(baseline)).toMatchObject({ visited: true, archived: true });
  });
});

describe("buildPinUpdateRequest", () => {
  it("何も変えなければ {}", () => {
    const draft = initialPinEditDraft(BASELINE);
    const request = build({});
    expect(request).toEqual({});
    expect(isEmptyPinUpdate(request)).toBe(true);
    expect(hasUnsavedPinEdit({ baseline: BASELINE, draft, newPhotoCount: 0 })).toBe(false);
  });

  it("名前を変更すると name だけが入る", () => {
    expect(build({ name: "  新  " })).toEqual({ name: "新" });
  });

  it("名前を空にすると null（消去）", () => {
    expect(build({ name: "   " })).toEqual({ name: null });
  });

  it("基準が空の名前を空白のままにしても差分なし", () => {
    const baseline = createPinEditBaseline({ ...PIN, name: null });
    expect(build({ name: "  " }, { baseline })).toEqual({});
  });

  it("前後の空白だけの違いは差分なし", () => {
    expect(build({ name: " 旧名前 ", memo: "旧メモ\n" })).toEqual({});
  });

  it("メモを変更・消去", () => {
    expect(build({ memo: "新メモ" })).toEqual({ memo: "新メモ" });
    expect(build({ memo: "" })).toEqual({ memo: null });
  });

  it("canEditFields が false なら name / memo は含まない", () => {
    expect(build({ name: "x", memo: "y" }, { canEditFields: false })).toEqual({});
  });

  it("visited だけ変えると visited だけが入る", () => {
    expect(build({ visited: true })).toEqual({ visited: true });
  });

  it("archived だけ変えると archived だけが入る", () => {
    expect(build({ archived: true })).toEqual({ archived: true });
  });

  it("基準が true のものを false にすると false が入る（省略ではなく明示）", () => {
    const baseline = createPinEditBaseline({ ...PIN, visited: true, archived: true });
    expect(build({ visited: false, archived: false }, { baseline })).toEqual({
      visited: false,
      archived: false,
    });
  });

  it("visited / archived を同時に変えて元に戻すと差分なし・未保存なし", () => {
    const draft = { ...initialPinEditDraft(BASELINE), visited: true, archived: true };
    expect(hasUnsavedPinEdit({ baseline: BASELINE, draft, newPhotoCount: 0 })).toBe(true);
    const restored = { ...draft, visited: false, archived: false };
    expect(hasUnsavedPinEdit({ baseline: BASELINE, draft: restored, newPhotoCount: 0 })).toBe(
      false,
    );
    expect(build({ visited: false, archived: false })).toEqual({});
  });

  it("canArchive が false なら archived は含めない（visited は含む）", () => {
    expect(build({ visited: true, archived: true }, { canArchive: false })).toEqual({
      visited: true,
    });
  });

  it("canEditVisited が false なら visited は含めない（archived は含む）", () => {
    expect(build({ visited: true, archived: true }, { canEditVisited: false })).toEqual({
      archived: true,
    });
  });

  it("地図だけ変えると sanpo_map_id だけが入る（SS-175）", () => {
    expect(build({ sanpoMapId: "map-2" })).toEqual({ sanpo_map_id: "map-2" });
  });

  it("同じ地図に戻すと差分なし・未保存なし", () => {
    expect(build({ sanpoMapId: "map-1" })).toEqual({});
    const moved = { ...initialPinEditDraft(BASELINE), sanpoMapId: "map-2" };
    expect(hasUnsavedPinEdit({ baseline: BASELINE, draft: moved, newPhotoCount: 0 })).toBe(true);
    expect(
      hasUnsavedPinEdit({
        baseline: BASELINE,
        draft: { ...moved, sanpoMapId: "map-1" },
        newPhotoCount: 0,
      }),
    ).toBe(false);
  });

  it("canChangeSanpoMap が false なら sanpo_map_id は含めない", () => {
    expect(build({ sanpoMapId: "map-2", name: "N" }, { canChangeSanpoMap: false })).toEqual({
      name: "N",
    });
  });

  it("名前と地図を同時に変えると両方入る", () => {
    expect(build({ name: "N", sanpoMapId: "map-2" })).toEqual({
      name: "N",
      sanpo_map_id: "map-2",
    });
  });

  it("基準値の地図の名前は詳細から写る", () => {
    expect(BASELINE).toMatchObject({ sanpoMapId: "map-1", sanpoMapName: "地図" });
  });

  it("既存タグを削除すると remove_tag_ids", () => {
    expect(build({ tags: ["桜"] })).toEqual({ remove_tag_ids: ["tag-a"] });
  });

  it("新タグを追加すると add_tags", () => {
    expect(build({ tags: ["Cafe", "桜", "梅"] })).toEqual({ add_tags: ["梅"] });
  });

  it("既存を消して同じキー（大文字小文字違い含む）で付け直すと差分なし", () => {
    expect(build({ tags: ["cafe", "桜"] })).toEqual({});
  });

  it("追加したタグを消すと差分なし", () => {
    expect(build({ tags: ["Cafe", "桜"] })).toEqual({});
  });

  it("canRemoveTag が false の既存タグが下書きから消えていても remove_tag_ids に入らない", () => {
    const request = build({ tags: ["Cafe"] }, { canRemoveTag: (tag) => tag.id !== "tag-b" });
    expect(request).toEqual({});
  });

  it("複数の変更を同時に表す（空配列のキーは出さない）", () => {
    expect(build({ name: "N", tags: ["桜", "梅"] })).toEqual({
      name: "N",
      remove_tag_ids: ["tag-a"],
      add_tags: ["梅"],
    });
  });
});

describe("hasUnsavedPinEdit", () => {
  it("写真の印だけ / 追加写真だけでも true（PATCH 自体は {}）", () => {
    const draft = { ...initialPinEditDraft(BASELINE), photoIdsToDelete: ["p1"] };
    expect(hasUnsavedPinEdit({ baseline: BASELINE, draft, newPhotoCount: 0 })).toBe(true);
    expect(build({ photoIdsToDelete: ["p1"] })).toEqual({});
    expect(
      hasUnsavedPinEdit({
        baseline: BASELINE,
        draft: initialPinEditDraft(BASELINE),
        newPhotoCount: 2,
      }),
    ).toBe(true);
  });

  it("テキストの差分があれば true", () => {
    const draft = { ...initialPinEditDraft(BASELINE), memo: "変えた" };
    expect(hasUnsavedPinEdit({ baseline: BASELINE, draft, newPhotoCount: 0 })).toBe(true);
  });
});

describe("togglePhotoDeletion", () => {
  it("付与 → 解除で元に戻る", () => {
    const marked = togglePhotoDeletion([], "p1");
    expect(marked).toEqual(["p1"]);
    expect(togglePhotoDeletion(marked, "p1")).toEqual([]);
  });

  it("他の印は保つ", () => {
    expect(togglePhotoDeletion(["p1", "p2"], "p1")).toEqual(["p2"]);
  });
});

describe("isDraftTagRemovable", () => {
  const canRemove = (tag: PinTagView) => tag.createdByUserId === "me";

  it("新規タグは常に true", () => {
    expect(isDraftTagRemovable("梅", BASELINE, () => false)).toBe(true);
  });

  it("基準に一致するタグは権限どおり（キー比較）", () => {
    expect(isDraftTagRemovable("Cafe", BASELINE, canRemove)).toBe(true);
    expect(isDraftTagRemovable("cafe", BASELINE, canRemove)).toBe(true);
    expect(isDraftTagRemovable("桜", BASELINE, canRemove)).toBe(false);
  });
});

describe("resolvePinEditSaveAvailability", () => {
  const OK_ERRORS = { name: null, memo: null };
  const base = {
    fieldErrors: OK_ERRORS,
    photos: [] as { status: PhotoDraftStatus }[],
    isSaving: false,
    hasChanges: true,
  };

  it("問題なければ保存可", () => {
    expect(resolvePinEditSaveAvailability(base)).toEqual({ canSave: true });
  });

  it("優先順位: saving > no_changes > field_error > photos_preparing > photos_failed", () => {
    const errors = { name: "長すぎる", memo: null };
    expect(
      resolvePinEditSaveAvailability({
        ...base,
        isSaving: true,
        hasChanges: false,
        fieldErrors: errors,
      }),
    ).toEqual({ canSave: false, reason: "saving" });
    expect(
      resolvePinEditSaveAvailability({ ...base, hasChanges: false, fieldErrors: errors }),
    ).toEqual({ canSave: false, reason: "no_changes" });
    expect(
      resolvePinEditSaveAvailability({
        ...base,
        fieldErrors: errors,
        photos: [{ status: "processing" }],
      }),
    ).toEqual({ canSave: false, reason: "field_error" });
    expect(
      resolvePinEditSaveAvailability({
        ...base,
        photos: [{ status: "processing" }, { status: "failed" }],
      }),
    ).toEqual({ canSave: false, reason: "photos_preparing" });
    expect(resolvePinEditSaveAvailability({ ...base, photos: [{ status: "failed" }] })).toEqual({
      canSave: false,
      reason: "photos_failed",
    });
  });
});
