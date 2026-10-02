import { describe, expect, it } from "vitest";

import {
  canDeletePinPhoto,
  canRemovePinTag,
  resolvePinPermissions,
  resolvePinRole,
} from "@/features/pin/lib/pinPermissions";

const ME = "user-me";
const OTHER = "user-other";

const OWN_PIN = { createdByUserId: ME };
const OTHERS_PIN = { createdByUserId: OTHER };

describe("resolvePinPermissions", () => {
  it("owner: 他人のピンでも全部 true", () => {
    expect(resolvePinPermissions({ role: "owner", currentUserId: ME }, OTHERS_PIN)).toEqual({
      canEditFields: true,
      canDeletePin: true,
      canAddTags: true,
      canAddPhotos: true,
      canOpenEditor: true,
    });
  });

  it("editor・自分のピン: 名前メモ編集・削除が可", () => {
    const p = resolvePinPermissions({ role: "editor", currentUserId: ME }, OWN_PIN);
    expect(p.canEditFields).toBe(true);
    expect(p.canDeletePin).toBe(true);
  });

  it("editor・他人のピン: 編集・削除は不可、追加系と編集ボタンは可", () => {
    const p = resolvePinPermissions({ role: "editor", currentUserId: ME }, OTHERS_PIN);
    expect(p.canEditFields).toBe(false);
    expect(p.canDeletePin).toBe(false);
    expect(p.canAddTags).toBe(true);
    expect(p.canAddPhotos).toBe(true);
    expect(p.canOpenEditor).toBe(true);
  });

  it("role 不明・自分のピン: editor と同じ（全部可）", () => {
    const p = resolvePinPermissions({ role: null, currentUserId: ME }, OWN_PIN);
    expect(p.canEditFields).toBe(true);
    expect(p.canDeletePin).toBe(true);
  });

  it("role 不明・他人のピン: 編集・削除は不可", () => {
    const p = resolvePinPermissions({ role: null, currentUserId: ME }, OTHERS_PIN);
    expect(p.canEditFields).toBe(false);
    expect(p.canDeletePin).toBe(false);
    expect(p.canOpenEditor).toBe(true);
  });

  it("currentUserId が null でも owner なら全部可", () => {
    const p = resolvePinPermissions({ role: "owner", currentUserId: null }, OTHERS_PIN);
    expect(p.canEditFields).toBe(true);
    expect(p.canDeletePin).toBe(true);
  });

  it("currentUserId が null の editor は持ち主判定がすべて false", () => {
    const p = resolvePinPermissions({ role: "editor", currentUserId: null }, OWN_PIN);
    expect(p.canEditFields).toBe(false);
    expect(p.canDeletePin).toBe(false);
  });
});

describe("canRemovePinTag / canDeletePinPhoto", () => {
  it("owner は他人のものも true", () => {
    const ctx = { role: "owner", currentUserId: ME } as const;
    expect(canRemovePinTag(ctx, { createdByUserId: OTHER })).toBe(true);
    expect(canDeletePinPhoto(ctx, { uploadedByUserId: OTHER })).toBe(true);
  });

  it("editor は自分のものだけ true", () => {
    const ctx = { role: "editor", currentUserId: ME } as const;
    expect(canRemovePinTag(ctx, { createdByUserId: ME })).toBe(true);
    expect(canRemovePinTag(ctx, { createdByUserId: OTHER })).toBe(false);
    expect(canDeletePinPhoto(ctx, { uploadedByUserId: ME })).toBe(true);
    expect(canDeletePinPhoto(ctx, { uploadedByUserId: OTHER })).toBe(false);
  });

  it("role 不明は editor 扱い、currentUserId null の editor は自分のものも false", () => {
    expect(canRemovePinTag({ role: null, currentUserId: ME }, { createdByUserId: OTHER })).toBe(
      false,
    );
    expect(canRemovePinTag({ role: null, currentUserId: ME }, { createdByUserId: ME })).toBe(true);
    expect(canDeletePinPhoto({ role: null, currentUserId: null }, { uploadedByUserId: ME })).toBe(
      false,
    );
  });
});

describe("resolvePinRole", () => {
  const maps = [
    { id: "m1", role: "owner" },
    { id: "m2", role: "editor" },
  ] as const;

  it("一致する地図の role を返す", () => {
    expect(resolvePinRole(maps, "m1")).toBe("owner");
    expect(resolvePinRole(maps, "m2")).toBe("editor");
  });

  it("一致なし・空配列は null", () => {
    expect(resolvePinRole(maps, "m3")).toBeNull();
    expect(resolvePinRole([], "m1")).toBeNull();
  });
});
