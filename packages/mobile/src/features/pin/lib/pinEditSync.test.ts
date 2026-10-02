import { describe, expect, it, vi } from "vitest";

import {
  buildPinUpdateRequest,
  createPinEditBaseline,
  hasUnsavedPinEdit,
  initialPinEditDraft,
  type PinEditBaseline,
  type PinEditDraft,
} from "@/features/pin/lib/pinEditDraft";
import { isPinEditError } from "@/features/pin/lib/pinEditError";
import { runPinEditSave, type PinEditSaveDeps } from "@/features/pin/lib/pinEditSaveRunner";
import {
  addDeletedPhotoId,
  canConfirmPinEditBaseline,
  excludeDeletedPhotos,
  rebaseBaselineAfterUpdate,
  rebaseDraftAfterPhotoDeleted,
  resolvePinEditBodyError,
} from "@/features/pin/lib/pinEditSync";
import type { PinDetail, PinPhoto, PinTagView } from "@/features/pin/types";

const TAG_X: PinTagView = { id: "tag-x", label: "X", createdByUserId: "me" };

const PIN_A: PinDetail = {
  id: "pin-1",
  name: "A",
  memo: "",
  location: { latitude: 0, longitude: 0 },
  sanpoMapId: "map-1",
  createdByUserId: "me",
  tags: [TAG_X],
  photos: [],
  photoCount: 0,
  sanpoMapName: "地図",
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** 名前を A→B に変え、タグ X を外した保存の応答（サーバーの最新状態）。 */
const PIN_B: PinDetail = { ...PIN_A, name: "B", tags: [] };

function photo(id: string): PinPhoto {
  return { id, uploadedByUserId: "me" } as PinPhoto;
}

/** 編集画面の状態（基準値・下書き・DELETE 済み）を、hook と同じ規則で動かす最小のハーネス。 */
function createScreen(pin: PinDetail) {
  let baseline: PinEditBaseline = createPinEditBaseline(pin);
  let draft: PinEditDraft = initialPinEditDraft(baseline);
  let deletedPhotoIds: readonly string[] = [];
  let updated = false;
  const updatePin = vi.fn(async (_id: string, _request: unknown) => PIN_B);
  const deletePinPhoto = vi.fn(async (_pinId: string, photoId: string) => {
    if (photoId === "p-fail") throw new TypeError("Network request failed");
    return { alreadyDeleted: false };
  });
  const deletedSet = new Set<string>();

  const deps = (request: ReturnType<typeof currentRequest>, photoIdsToDelete: string[]) =>
    ({
      pinId: "pin-1",
      request,
      photoIdsToDelete,
      isPhotoDeleted: (id: string) => deletedSet.has(id),
      markPhotoDeleted: (id: string) => {
        deletedSet.add(id);
        deletedPhotoIds = addDeletedPhotoId(deletedPhotoIds, id);
        draft = rebaseDraftAfterPhotoDeleted(draft, id);
      },
      isUpdated: () => updated,
      onUpdated: (result: PinDetail) => {
        updated = true;
        baseline = rebaseBaselineAfterUpdate(result);
      },
      updatePin,
      deletePinPhoto,
      attachPhotos: async () => {},
      onProgress: () => {},
    }) satisfies PinEditSaveDeps;

  function currentRequest() {
    return buildPinUpdateRequest({
      baseline,
      draft,
      permissions: { canEditFields: true },
      canRemoveTag: () => true,
    });
  }

  return {
    updatePin,
    deletePinPhoto,
    get baseline() {
      return baseline;
    },
    get draft() {
      return draft;
    },
    get deletedPhotoIds() {
      return deletedPhotoIds;
    },
    edit(patch: Partial<PinEditDraft>) {
      draft = { ...draft, ...patch };
    },
    /** submit: 差分を作って1回保存する（新しいスナップショット。PATCH 済みフラグを戻す）。 */
    async submit() {
      updated = false;
      await runPinEditSave(deps(currentRequest(), [...draft.photoIdsToDelete]));
    },
    /** 同じスナップショットでの自動再試行（PATCH 済みフラグはそのまま）。 */
    async autoRetry(request: ReturnType<typeof currentRequest>, ids: string[]) {
      await runPinEditSave(deps(request, ids));
    },
    request: currentRequest,
  };
}

describe("部分保存後の基準値の作り直し（SS-119 レビュー A-1）", () => {
  it("PATCH 成功 → 写真の段で失敗 → 名前を元へ戻すと差分が出る（PATCH が再送される）", async () => {
    const screen = createScreen(PIN_A);
    screen.edit({ name: "B", tags: [], photoIdsToDelete: ["p-fail"] });

    // 1回目: PATCH は成功し、写真の削除で失敗する。
    await expect(screen.submit()).rejects.toSatisfy(isPinEditError);
    expect(screen.updatePin).toHaveBeenCalledTimes(1);
    expect(screen.baseline.name).toBe("B");
    expect(screen.baseline.tags).toEqual([]);

    // 名前を A に戻し、タグ X を付け直す。基準値が B（タグ無し）なので差分が出る。
    screen.edit({ name: "A", tags: ["X"] });
    expect(screen.request()).toEqual({ name: "A", add_tags: ["X"] });
    expect(
      hasUnsavedPinEdit({
        baseline: screen.baseline,
        draft: screen.draft,
        newPhotoCount: 0,
      }),
    ).toBe(true);
  });

  it("古い基準値のままなら、元に戻した編集は差分0件になる（修正前の挙動の確認）", () => {
    const stale = createPinEditBaseline(PIN_A);
    const draft = { ...initialPinEditDraft(stale), name: "A" };
    expect(
      buildPinUpdateRequest({
        baseline: stale,
        draft,
        permissions: { canEditFields: true },
        canRemoveTag: () => true,
      }),
    ).toEqual({});
  });

  it("再試行（手動）では PATCH を再送しない: 基準値が最新なので差分が空になる", async () => {
    const screen = createScreen(PIN_A);
    screen.edit({ name: "B", tags: [], photoIdsToDelete: ["p-fail"] });
    await expect(screen.submit()).rejects.toSatisfy(isPinEditError);
    screen.updatePin.mockClear();

    expect(screen.request()).toEqual({});
    await expect(screen.submit()).rejects.toSatisfy(isPinEditError);

    expect(screen.updatePin).not.toHaveBeenCalled();
  });

  it("再試行（自動）でも、PATCH 済みなら同じスナップショットで再送しない", async () => {
    const screen = createScreen(PIN_A);
    screen.edit({ name: "B", tags: [], photoIdsToDelete: ["p-fail"] });
    const snapshot = screen.request();
    await expect(screen.submit()).rejects.toSatisfy(isPinEditError);
    screen.updatePin.mockClear();

    await expect(screen.autoRetry(snapshot, ["p-fail"])).rejects.toSatisfy(isPinEditError);

    expect(screen.updatePin).not.toHaveBeenCalled();
  });

  it("DELETE 済みの写真は、削除の印と既存写真の表示から外れる", async () => {
    const screen = createScreen(PIN_A);
    screen.edit({ photoIdsToDelete: ["p1", "p-fail"] });

    await expect(screen.submit()).rejects.toSatisfy(isPinEditError);

    expect(screen.deletedPhotoIds).toEqual(["p1"]);
    expect(screen.draft.photoIdsToDelete).toEqual(["p-fail"]);
    const shown = excludeDeletedPhotos({
      photos: [photo("p1"), photo("p-fail"), photo("p3")],
      photoCount: 3,
      deletedPhotoIds: screen.deletedPhotoIds,
    });
    expect(shown.photos.map((p) => p.id)).toEqual(["p-fail", "p3"]);
    expect(shown.photoCount).toBe(2);
  });
});

describe("rebaseDraftAfterPhotoDeleted / addDeletedPhotoId", () => {
  const draft: PinEditDraft = { name: "", memo: "", tags: [], photoIdsToDelete: ["p1", "p2"] };

  it("印に無い写真なら同じ下書きを返す", () => {
    expect(rebaseDraftAfterPhotoDeleted(draft, "p9")).toBe(draft);
  });

  it("DELETE 済みの id は重複して足さない", () => {
    expect(addDeletedPhotoId(["p1"], "p1")).toEqual(["p1"]);
    expect(addDeletedPhotoId(["p1"], "p2")).toEqual(["p1", "p2"]);
  });
});

describe("excludeDeletedPhotos", () => {
  it("削除済みが無ければそのまま、総数は 0 未満にならない", () => {
    expect(
      excludeDeletedPhotos({ photos: [photo("a")], photoCount: 1, deletedPhotoIds: [] }),
    ).toEqual({ photos: [photo("a")], photoCount: 1 });
    expect(
      excludeDeletedPhotos({ photos: [], photoCount: 0, deletedPhotoIds: ["a", "b"] }).photoCount,
    ).toBe(0);
  });
});

describe("canConfirmPinEditBaseline（A-2）", () => {
  it("再取得中・エラー中・ピン未取得では確定しない", () => {
    expect(canConfirmPinEditBaseline({ hasPin: true, isFetching: false, hasError: false })).toBe(
      true,
    );
    expect(canConfirmPinEditBaseline({ hasPin: true, isFetching: true, hasError: false })).toBe(
      false,
    );
    expect(canConfirmPinEditBaseline({ hasPin: true, isFetching: false, hasError: true })).toBe(
      false,
    );
    expect(canConfirmPinEditBaseline({ hasPin: false, isFetching: false, hasError: false })).toBe(
      false,
    );
  });
});

describe("resolvePinEditBodyError（A-3）", () => {
  it("基準値の確定前は、エラーをそのまま返す", () => {
    expect(resolvePinEditBodyError("network", false)).toBe("network");
    expect(resolvePinEditBodyError(null, false)).toBeNull();
  });

  it("確定後は、not_found 以外のエラーでフォームを消さない", () => {
    expect(resolvePinEditBodyError("network", true)).toBeNull();
    expect(resolvePinEditBodyError("server", true)).toBeNull();
    expect(resolvePinEditBodyError("not_found", true)).toBe("not_found");
  });
});
