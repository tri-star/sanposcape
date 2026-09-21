import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/apiError";
import type { PinCreate } from "@/api/generated/model";
import { photoDraftReducer } from "@/features/pin/lib/photoDraft";
import type { PhotoDraftAction } from "@/features/pin/lib/photoDraft";
import {
  BACKEND_PENDING_UPLOADS_MAX,
  PIN_PHOTOS_PER_REQUEST_MAX,
} from "@/features/pin/lib/pinLimits";
import { isPinSaveError, isPhotoSlotsBusyError } from "@/features/pin/lib/pinSaveError";
import { runPinSave } from "@/features/pin/lib/pinSaveRunner";
import type { PinSaveRunnerDeps } from "@/features/pin/lib/pinSaveRunner";
import type {
  PhotoDraftItem,
  PhotoDraftStatus,
  PinSaveProgress,
  SavedPin,
} from "@/features/pin/types";

function makeItem(
  localId: string,
  status: PhotoDraftStatus,
  uploadId: string | null = null,
): PhotoDraftItem {
  return {
    localId,
    previewUri: `mock://${localId}.jpg`,
    picked: { uri: `mock://${localId}.jpg`, width: 2048, height: 1536, mimeType: "image/jpeg" },
    prepared:
      status === "processing"
        ? null
        : {
            uri: `mock://${localId}-p.jpg`,
            width: 2048,
            height: 1536,
            byteSize: 500_000,
            mimeType: "image/jpeg",
          },
    status,
    uploadId,
    errorCode: null,
  };
}

/** 呼び出しの度に最新の状態を返す/更新する簡易ストア（React に依存しない）。 */
function createStateHarness(initial: PhotoDraftItem[]) {
  let items = initial;
  return {
    getItems: (): readonly PhotoDraftItem[] => items,
    dispatch: (action: PhotoDraftAction) => {
      items = photoDraftReducer(items, action);
    },
    get current() {
      return items;
    },
  };
}

type FakeServerHooks = {
  /** callIndex は0始まり。"throw_lost" は「サーバー側の処理は成立したが応答が失われた」を模す。 */
  onCreatePin?: (callIndex: number) => "throw_lost" | undefined;
  onAddPinPhotos?: (callIndex: number) => "throw_lost" | undefined;
  onTransfer?: (
    item: PhotoDraftItem,
    callIndex: number,
  ) => "throw_network" | "throw_413" | undefined;
};

/** backend の未使用枠上限（30）を再現する模型サーバー。 */
function createFakeServer(options: { otherPendingSlots?: number; hooks?: FakeServerHooks } = {}) {
  // 他所（別画面・別端末）の未使用枠。deleteUpload の対象にはならない（この模型サーバーが
  // 発行した ID ではないため）。
  const otherPending = options.otherPendingSlots ?? 0;
  // このサーバーが発行し、まだ attached になっていない upload_id（PR #93 T11 の
  // deleteUpload で個別に解放できるよう、単純なカウンタではなく Set で持つ）。
  const pendingUploadIds = new Set<string>();
  const pendingCount = () => otherPending + pendingUploadIds.size;
  let maxPendingObserved = pendingCount();
  const attachedByPin = new Set<string>();
  let pinCreated = false;
  const pinId = "pin-1";
  let createPinCallCount = 0;
  let addPinPhotosCallCount = 0;
  let transferCallCount = 0;
  let uploadSeq = 0;

  const transferPhoto: PinSaveRunnerDeps["transferPhoto"] = vi.fn(async (item) => {
    const action = options.hooks?.onTransfer?.(item, transferCallCount);
    transferCallCount += 1;
    if (action === "throw_413") {
      throw new ApiError(413);
    }
    if (action === "throw_network") {
      throw new TypeError("Network request failed");
    }
    if (pendingCount() >= BACKEND_PENDING_UPLOADS_MAX) {
      throw new ApiError(429);
    }
    uploadSeq += 1;
    const uploadId = `up-${item.localId}-${uploadSeq}`;
    pendingUploadIds.add(uploadId);
    maxPendingObserved = Math.max(maxPendingObserved, pendingCount());
    return uploadId;
  });

  const createPin: PinSaveRunnerDeps["createPin"] = vi.fn(async (request: PinCreate) => {
    const action = options.hooks?.onCreatePin?.(createPinCallCount);
    createPinCallCount += 1;
    if (!pinCreated) {
      pinCreated = true;
      for (const id of request.photo_upload_ids ?? []) {
        attachedByPin.add(id);
        pendingUploadIds.delete(id);
      }
      if (action === "throw_lost") {
        throw new TypeError("Network request failed");
      }
    }
    const pin: SavedPin = {
      id: pinId,
      sanpoMapId: "map-1",
      sanpoMapName: "最初の地図",
      photoCount: attachedByPin.size,
    };
    return { pin, attachedUploadIds: [...attachedByPin] };
  });

  const addPinPhotos: PinSaveRunnerDeps["addPinPhotos"] = vi.fn(async (_pinId, ids) => {
    const action = options.hooks?.onAddPinPhotos?.(addPinPhotosCallCount);
    const newlyAttached: string[] = [];
    for (const id of ids) {
      if (!attachedByPin.has(id)) {
        attachedByPin.add(id);
        pendingUploadIds.delete(id);
        newlyAttached.push(id);
      } else {
        newlyAttached.push(id);
      }
    }
    addPinPhotosCallCount += 1;
    if (action === "throw_lost") {
      throw new TypeError("Network request failed");
    }
    return { photoCount: attachedByPin.size, attachedUploadIds: [...ids] };
  });

  /**
   * `DELETE /pin-photo-uploads/{upload_id}`（PR #93 T11）の模型。本人の pending 枠のみ
   * 解放する（attached は対象外＝呼び出し側の責務。この模型では単純に無視する）。
   */
  const deleteUpload = vi.fn((uploadId: string) => {
    pendingUploadIds.delete(uploadId);
  });

  return {
    transferPhoto,
    createPin,
    addPinPhotos,
    deleteUpload,
    get maxPendingObserved() {
      return maxPendingObserved;
    },
    get createPinCallCount() {
      return createPinCallCount;
    },
    get addPinPhotosCallCount() {
      return addPinPhotosCallCount;
    },
    get pending() {
      return pendingCount();
    },
  };
}

function buildDeps(
  harness: ReturnType<typeof createStateHarness>,
  server: ReturnType<typeof createFakeServer>,
  extra?: { savedPinIdInit?: string | null; progressSink?: PinSaveProgress[] },
): PinSaveRunnerDeps {
  let savedPinId: string | null = extra?.savedPinIdInit ?? null;
  return {
    getItems: harness.getItems,
    dispatch: harness.dispatch,
    getSavedPinId: () => savedPinId,
    setSavedPinId: (id) => {
      savedPinId = id;
    },
    buildCreateRequest: (photoUploadIds) => ({
      client_pin_id: "11111111-1111-4111-8111-111111111111",
      location: { latitude: 35.681236, longitude: 139.767125 },
      tags: [],
      photo_upload_ids: [...photoUploadIds],
    }),
    createPin: server.createPin,
    addPinPhotos: server.addPinPhotos,
    transferPhoto: server.transferPhoto,
    awaitBackgroundIdle: async () => {},
    onProgress: (progress) => extra?.progressSink?.push(progress),
  };
}

describe("runPinSave", () => {
  it("写真0枚: createPin が photo_upload_ids: [] で1回、addPinPhotos は呼ばれない", async () => {
    const harness = createStateHarness([]);
    const server = createFakeServer();
    const deps = buildDeps(harness, server);

    const result = await runPinSave(deps);

    expect(server.createPinCallCount).toBe(1);
    expect(server.addPinPhotosCallCount).toBe(0);
    expect(result.id).toBe("pin-1");
  });

  it("先行アップロード済み8枚: createPin に8件、addPinPhotos は呼ばれない", async () => {
    const items = Array.from({ length: 8 }, (_, i) => makeItem(`a${i}`, "uploaded", `up-a${i}`));
    const harness = createStateHarness(items);
    const server = createFakeServer();
    const deps = buildDeps(harness, server);

    await runPinSave(deps);

    expect(server.createPinCallCount).toBe(1);
    expect(server.addPinPhotosCallCount).toBe(0);
    expect(harness.current.every((item) => item.status === "attached")).toBe(true);
  });

  it("先行20枚 + 待機15枚（計35）: 全件 attached、模型サーバーの未紐付け数は一度も30を超えない", async () => {
    const uploaded = Array.from({ length: 20 }, (_, i) =>
      makeItem(`u${i}`, "uploaded", `up-u${i}`),
    );
    const waiting = Array.from({ length: 15 }, (_, i) => makeItem(`w${i}`, "waiting"));
    const harness = createStateHarness([...uploaded, ...waiting]);
    // 先行20枚ぶんは既にサーバー側の未使用枠を占有している前提。
    const server = createFakeServer({ otherPendingSlots: 20 });
    const deps = buildDeps(harness, server);

    const result = await runPinSave(deps);

    expect(harness.current).toHaveLength(35);
    expect(harness.current.every((item) => item.status === "attached")).toBe(true);
    expect(server.maxPendingObserved).toBeLessThanOrEqual(BACKEND_PENDING_UPLOADS_MAX);
    expect(server.createPinCallCount).toBe(1);
    expect(server.addPinPhotosCallCount).toBe(3);
    expect(result.photoCount).toBe(35);
  });

  it("100枚（先行20・待機80）: 全件 attached、429 が一度も起きない", async () => {
    const uploaded = Array.from({ length: 20 }, (_, i) =>
      makeItem(`u${i}`, "uploaded", `up-u${i}`),
    );
    const waiting = Array.from({ length: 80 }, (_, i) => makeItem(`w${i}`, "waiting"));
    const harness = createStateHarness([...uploaded, ...waiting]);
    const server = createFakeServer({ otherPendingSlots: 20 });
    const deps = buildDeps(harness, server);

    await runPinSave(deps);

    expect(harness.current).toHaveLength(100);
    expect(harness.current.every((item) => item.status === "attached")).toBe(true);
    expect(server.maxPendingObserved).toBeLessThanOrEqual(BACKEND_PENDING_UPLOADS_MAX);
  });

  it("他所の未使用枠25が残っている状態で35枚: 429→待機→回復を繰り返し、最終的に全件 attached", async () => {
    const items = Array.from({ length: 35 }, (_, i) => makeItem(`w${i}`, "waiting"));
    const harness = createStateHarness(items);
    const server = createFakeServer({ otherPendingSlots: 25 });
    const deps = buildDeps(harness, server);

    await runPinSave(deps);

    expect(harness.current.every((item) => item.status === "attached")).toBe(true);
    expect(server.maxPendingObserved).toBeLessThanOrEqual(BACKEND_PENDING_UPLOADS_MAX);
  });

  it("他所の未使用枠30（空けられる枠が無い）・作成済み: PhotoSlotsBusyError（ピンは作成済み）", async () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem(`w${i}`, "waiting"));
    const harness = createStateHarness(items);
    const server = createFakeServer({ otherPendingSlots: BACKEND_PENDING_UPLOADS_MAX });
    const deps = buildDeps(harness, server, { savedPinIdInit: "pin-1" });

    await expect(runPinSave(deps)).rejects.toSatisfy(
      (error: unknown) =>
        isPinSaveError(error) &&
        error.stage === "add_photos" &&
        error.savedPinId === "pin-1" &&
        isPhotoSlotsBusyError(error.cause),
    );
  });

  it("createPin の応答喪失（1回目 throw・サーバーは作成済み）→ 再実行で回復する", async () => {
    const items = Array.from({ length: 12 }, (_, i) => makeItem(`u${i}`, "uploaded", `up-u${i}`));
    const harness = createStateHarness(items);
    const server = createFakeServer({
      hooks: { onCreatePin: (i) => (i === 0 ? "throw_lost" : undefined) },
    });
    const deps = buildDeps(harness, server);

    await expect(runPinSave(deps)).rejects.toThrow();
    // 応答が失われた=setSavedPinId は呼ばれていない前提（getSavedPinId は再実行でも null）。

    await runPinSave(deps);

    expect(server.createPinCallCount).toBe(2);
    expect(harness.current.every((item) => item.status === "attached")).toBe(true);
    // 重複紐付けは起きない（addPinPhotos が残り2枚だけを処理する）。
    expect(server.addPinPhotosCallCount).toBe(1);
  });

  it("addPinPhotos の応答喪失 → 再実行で同じ枠IDが再送され成功扱い（二重にならない）", async () => {
    const items = Array.from({ length: 12 }, (_, i) => makeItem(`u${i}`, "uploaded", `up-u${i}`));
    const harness = createStateHarness(items);
    const server = createFakeServer({
      hooks: { onAddPinPhotos: (i) => (i === 0 ? "throw_lost" : undefined) },
    });
    const deps = buildDeps(harness, server);

    await expect(runPinSave(deps)).rejects.toThrow();

    await runPinSave(deps);

    expect(harness.current.every((item) => item.status === "attached")).toBe(true);
    expect(harness.current).toHaveLength(12);
  });

  it("待機写真の直送で network 失敗: waiting に戻り PinSaveError。再実行で続きから送られる", async () => {
    const items = [makeItem("w0", "waiting"), makeItem("w1", "waiting")];
    const harness = createStateHarness(items);
    const server = createFakeServer({
      hooks: {
        onTransfer: (item, i) => (item.localId === "w0" && i === 0 ? "throw_network" : undefined),
      },
    });
    const deps = buildDeps(harness, server);

    await expect(runPinSave(deps)).rejects.toThrow();
    expect(harness.current.find((i) => i.localId === "w0")?.status).toBe("waiting");

    await runPinSave(deps);

    expect(harness.current.every((item) => item.status === "attached")).toBe(true);
  });

  it("待機写真が枠発行413: failed(too_large) になり PinSaveError。削除後の再実行で残りが送られる", async () => {
    const items = [makeItem("w0", "waiting"), makeItem("w1", "waiting")];
    const harness = createStateHarness(items);
    const server = createFakeServer({
      hooks: { onTransfer: (item) => (item.localId === "w0" ? "throw_413" : undefined) },
    });
    const deps = buildDeps(harness, server);

    await expect(runPinSave(deps)).rejects.toThrow();
    expect(harness.current.find((i) => i.localId === "w0")?.status).toBe("failed");

    harness.dispatch({ type: "removed", localId: "w0" });
    await runPinSave(deps);

    expect(harness.current).toHaveLength(1);
    expect(harness.current[0]?.status).toBe("attached");
  });

  it("途中で写真を削除（getItems から消える）: 以後のチャンクに含まれない", async () => {
    const items = Array.from({ length: 3 }, (_, i) => makeItem(`u${i}`, "uploaded", `up-u${i}`));
    const harness = createStateHarness(items);
    harness.dispatch({ type: "removed", localId: "u1" });
    const server = createFakeServer();
    const deps = buildDeps(harness, server);

    await runPinSave(deps);

    expect(harness.current.map((i) => i.localId)).toEqual(["u0", "u2"]);
    expect(harness.current.every((item) => item.status === "attached")).toBe(true);
  });

  it("onProgress: creating -> sending_photos の sent が単調増加し、最後は sent = total", async () => {
    const uploaded = Array.from({ length: 20 }, (_, i) =>
      makeItem(`u${i}`, "uploaded", `up-u${i}`),
    );
    const waiting = Array.from({ length: 5 }, (_, i) => makeItem(`w${i}`, "waiting"));
    const harness = createStateHarness([...uploaded, ...waiting]);
    const server = createFakeServer({ otherPendingSlots: 20 });
    const progressSink: PinSaveProgress[] = [];
    const deps = buildDeps(harness, server, { progressSink });

    await runPinSave(deps);

    expect(progressSink[0]).toEqual({ step: "creating" });
    const sentValues = progressSink
      .filter(
        (p): p is Extract<PinSaveProgress, { step: "sending_photos" }> =>
          p.step === "sending_photos",
      )
      .map((p) => p.sent);
    for (let i = 1; i < sentValues.length; i += 1) {
      expect(sentValues[i]).toBeGreaterThanOrEqual(sentValues[i - 1]!);
    }
    const last = progressSink.at(-1);
    expect(last).toMatchObject({ step: "sending_photos", sent: 25, total: 25 });
  });

  it("追加・削除を繰り返しても deleteUpload で pending が解放され、photo_slots_busy にならない（PR #93 T11）", async () => {
    const server = createFakeServer();

    // usePinPhotos.removePhoto と同じ手順（uploaded → removed の dispatch + deleteUpload の
    // best-effort 呼び出し）を25回繰り返す。T11 以前は削除時に deleteUpload を呼ばなかった
    // ため、この模型サーバー上の pending が解放されずリークし、最終的に
    // BACKEND_PENDING_UPLOADS_MAX に達して保存が photo_slots_busy になっていた。
    for (let i = 0; i < 25; i += 1) {
      const ghost = makeItem(`ghost${i}`, "waiting");
      const uploadId = await server.transferPhoto(ghost);
      server.deleteUpload(uploadId);
    }

    expect(server.pending).toBe(0);
    expect(server.maxPendingObserved).toBeLessThan(BACKEND_PENDING_UPLOADS_MAX);

    // 削除しなかった5枚は最終的に保存できる（pending がリークしていれば photo_slots_busy になる）。
    const remaining = Array.from({ length: 5 }, (_, i) => makeItem(`w${i}`, "waiting"));
    const harness = createStateHarness(remaining);
    const deps = buildDeps(harness, server);

    const result = await runPinSave(deps);

    expect(harness.current.every((item) => item.status === "attached")).toBe(true);
    expect(result.photoCount).toBe(5);
  });

  it(`不変条件: 1リクエストの紐付けは最大 ${PIN_PHOTOS_PER_REQUEST_MAX} 枚`, async () => {
    const items = Array.from({ length: PIN_PHOTOS_PER_REQUEST_MAX + 5 }, (_, i) =>
      makeItem(`u${i}`, "uploaded", `up-u${i}`),
    );
    const harness = createStateHarness(items);
    const server = createFakeServer();
    const deps = buildDeps(harness, server);

    await runPinSave(deps);

    for (const call of (server.createPin as ReturnType<typeof vi.fn>).mock.calls) {
      expect((call[0] as PinCreate).photo_upload_ids?.length ?? 0).toBeLessThanOrEqual(
        PIN_PHOTOS_PER_REQUEST_MAX,
      );
    }
    for (const call of (server.addPinPhotos as ReturnType<typeof vi.fn>).mock.calls) {
      expect((call[1] as string[]).length).toBeLessThanOrEqual(PIN_PHOTOS_PER_REQUEST_MAX);
    }
  });
});
