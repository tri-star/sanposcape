import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/apiError";
import type { PinUpdate } from "@/api/generated/model";
import { isPinEditError, type PinEditError } from "@/features/pin/lib/pinEditError";
import {
  runPinEditSave,
  type PinEditSaveDeps,
  type PinEditSaveProgress,
} from "@/features/pin/lib/pinEditSaveRunner";
import { PinSaveError } from "@/features/pin/lib/pinSaveError";
import type { PinDetail } from "@/features/pin/types";

const UPDATED_PIN: PinDetail = {
  id: "pin-1",
  name: "新",
  memo: null,
  location: { latitude: 0, longitude: 0 },
  sanpoMapId: "map-1",
  createdByUserId: "me",
  tags: [],
  photos: [],
  photoCount: 0,
  sanpoMapName: "地図",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function buildDeps(
  overrides: Partial<PinEditSaveDeps> = {},
  options: { log?: string[]; progress?: PinEditSaveProgress[]; deleted?: Set<string> } = {},
): PinEditSaveDeps {
  const log = options.log ?? [];
  const deleted = options.deleted ?? new Set<string>();
  return {
    pinId: "pin-1",
    request: { name: "新" },
    photoIdsToDelete: [],
    isPhotoDeleted: (id) => deleted.has(id),
    markPhotoDeleted: (id) => {
      deleted.add(id);
    },
    isUpdated: () => false,
    onUpdated: () => {},
    updatePin: vi.fn(async () => {
      log.push("update");
      return UPDATED_PIN;
    }),
    deletePinPhoto: vi.fn(async (_pinId: string, photoId: string) => {
      log.push(`delete:${photoId}`);
      return { alreadyDeleted: false };
    }),
    attachPhotos: vi.fn(async (onProgress) => {
      log.push("attach");
      onProgress({ sent: 1, total: 2 });
    }),
    onProgress: (p) => options.progress?.push(p),
    ...overrides,
  };
}

async function catchError(promise: Promise<unknown>): Promise<PinEditError> {
  try {
    await promise;
  } catch (error) {
    if (isPinEditError(error)) return error;
    throw error;
  }
  throw new Error("throw されるはず");
}

describe("runPinEditSave", () => {
  it("差分あり・削除2枚・追加あり: update → delete → delete → attach の順、進捗も順に出る", async () => {
    const log: string[] = [];
    const progress: PinEditSaveProgress[] = [];
    const deps = buildDeps({ photoIdsToDelete: ["p1", "p2"] }, { log, progress });

    await runPinEditSave(deps);

    expect(log).toEqual(["update", "delete:p1", "delete:p2", "attach"]);
    expect(progress).toEqual([
      { step: "updating" },
      { step: "deleting_photos", done: 1, total: 2 },
      { step: "deleting_photos", done: 2, total: 2 },
      { step: "sending_photos", sent: 1, total: 2 },
    ]);
  });

  it("差分が空なら updatePin を呼ばない", async () => {
    const deps = buildDeps({ request: {} as PinUpdate });

    await runPinEditSave(deps);

    expect(deps.updatePin).not.toHaveBeenCalled();
    expect(deps.attachPhotos).toHaveBeenCalledTimes(1);
  });

  it("PATCH に成功したら、応答を onUpdated に渡す", async () => {
    const onUpdated = vi.fn();
    const deps = buildDeps({ onUpdated });

    await runPinEditSave(deps);

    expect(onUpdated).toHaveBeenCalledWith(UPDATED_PIN);
  });

  it("PATCH 済みの記録があれば、差分があっても updatePin を再送しない（古いスナップショットで上書きしない）", async () => {
    const onUpdated = vi.fn();
    const deps = buildDeps({ isUpdated: () => true, onUpdated });

    await runPinEditSave(deps);

    expect(deps.updatePin).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("PATCH が失敗したときは onUpdated を呼ばない", async () => {
    const onUpdated = vi.fn();
    const deps = buildDeps({
      onUpdated,
      updatePin: vi.fn(async () => {
        throw new TypeError("Network request failed");
      }),
    });

    await catchError(runPinEditSave(deps));

    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("削除済みの記録がある写真は DELETE を呼ばない", async () => {
    const deps = buildDeps({ photoIdsToDelete: ["p1", "p2"] }, { deleted: new Set(["p1"]) });

    await runPinEditSave(deps);

    expect(deps.deletePinPhoto).toHaveBeenCalledTimes(1);
    expect(deps.deletePinPhoto).toHaveBeenCalledWith("pin-1", "p2");
  });

  it("update が失敗: stage=update で、以降の段を呼ばない", async () => {
    const cause = new ApiError(403);
    const deps = buildDeps({
      photoIdsToDelete: ["p1"],
      updatePin: vi.fn(async () => {
        throw cause;
      }),
    });

    const error = await catchError(runPinEditSave(deps));

    expect(error.stage).toBe("update");
    expect(error.cause).toBe(cause);
    expect(deps.deletePinPhoto).not.toHaveBeenCalled();
    expect(deps.attachPhotos).not.toHaveBeenCalled();
  });

  it("2枚目の削除が失敗しても、再実行は1枚目を呼ばず2枚目から", async () => {
    const deleted = new Set<string>();
    let failSecond = true;
    const deletePinPhoto = vi.fn(async (_pinId: string, photoId: string) => {
      if (photoId === "p2" && failSecond) throw new TypeError("Network request failed");
      return { alreadyDeleted: false };
    });
    const deps = buildDeps({ photoIdsToDelete: ["p1", "p2"], deletePinPhoto }, { deleted });

    const error = await catchError(runPinEditSave(deps));
    expect(error.stage).toBe("delete_photos");
    expect(deps.attachPhotos).not.toHaveBeenCalled();

    failSecond = false;
    deletePinPhoto.mockClear();
    await runPinEditSave(deps);

    expect(deletePinPhoto.mock.calls.map(([, id]) => id)).toEqual(["p2"]);
    expect(deps.attachPhotos).toHaveBeenCalledTimes(1);
  });

  it("deletePinPhoto が alreadyDeleted:true でも成功扱いで記録する", async () => {
    const deleted = new Set<string>();
    const deps = buildDeps(
      {
        photoIdsToDelete: ["p1"],
        deletePinPhoto: vi.fn(async () => ({ alreadyDeleted: true })),
      },
      { deleted },
    );

    await runPinEditSave(deps);

    expect(deleted.has("p1")).toBe(true);
  });

  it("attach が失敗: stage=add_photos で cause（PinSaveError）が保持される", async () => {
    const cause = new PinSaveError("add_photos", new TypeError("x"), "pin-1");
    const deps = buildDeps({
      attachPhotos: vi.fn(async () => {
        throw cause;
      }),
    });

    const error = await catchError(runPinEditSave(deps));

    expect(error.stage).toBe("add_photos");
    expect(error.cause).toBe(cause);
  });
});
