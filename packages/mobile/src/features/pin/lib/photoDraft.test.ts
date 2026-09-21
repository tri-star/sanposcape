import { describe, expect, it } from "vitest";

import {
  BACKEND_PENDING_UPLOADS_MAX,
  PIN_PHOTOS_PER_REQUEST_MAX,
  PIN_PHOTO_PREUPLOAD_MAX,
} from "@/features/pin/lib/pinLimits";
import {
  heldUploadSlots,
  nextAttachChunk,
  nextPreuploadWork,
  photoDraftReducer,
  photoDraftSummary,
  photoGridCaption,
} from "@/features/pin/lib/photoDraft";
import type { PhotoDraftItem } from "@/features/pin/types";
import type { PickedPhoto, PreparedPhoto } from "@/services/photo/types";

const PICKED: PickedPhoto = {
  uri: "mock://photo/1.jpg",
  width: 4032,
  height: 3024,
  mimeType: "image/jpeg",
};
const PREPARED: PreparedPhoto = {
  uri: "mock://photo/1-prepared.jpg",
  width: 2048,
  height: 1536,
  byteSize: 500_000,
  mimeType: "image/jpeg",
};

function item(overrides: Partial<PhotoDraftItem> & { localId: string }): PhotoDraftItem {
  return {
    previewUri: PICKED.uri,
    picked: PICKED,
    prepared: null,
    status: "processing",
    uploadId: null,
    errorCode: null,
    ...overrides,
  };
}

describe("定数の不変条件（改訂2）", () => {
  it(`PIN_PHOTOS_PER_REQUEST_MAX(${PIN_PHOTOS_PER_REQUEST_MAX}) <= PIN_PHOTO_PREUPLOAD_MAX(${PIN_PHOTO_PREUPLOAD_MAX}) < BACKEND_PENDING_UPLOADS_MAX(${BACKEND_PENDING_UPLOADS_MAX})`, () => {
    expect(PIN_PHOTOS_PER_REQUEST_MAX).toBeLessThanOrEqual(PIN_PHOTO_PREUPLOAD_MAX);
    expect(PIN_PHOTO_PREUPLOAD_MAX).toBeLessThan(BACKEND_PENDING_UPLOADS_MAX);
  });
});

describe("photoDraftReducer", () => {
  it("added: processing で追加される", () => {
    const state = photoDraftReducer([], {
      type: "added",
      items: [{ localId: "a", picked: PICKED }],
    });
    expect(state).toEqual([
      {
        localId: "a",
        previewUri: PICKED.uri,
        picked: PICKED,
        prepared: null,
        status: "processing",
        uploadId: null,
        errorCode: null,
      },
    ]);
  });

  it("一連の遷移: processing -> prepared(waiting) -> uploadStarted -> uploaded -> attached", () => {
    let state = photoDraftReducer([], { type: "added", items: [{ localId: "a", picked: PICKED }] });
    state = photoDraftReducer(state, { type: "prepared", localId: "a", prepared: PREPARED });
    expect(state[0]?.status).toBe("waiting");
    expect(state[0]?.previewUri).toBe(PREPARED.uri);

    state = photoDraftReducer(state, { type: "uploadStarted", localId: "a" });
    expect(state[0]?.status).toBe("uploading");

    state = photoDraftReducer(state, { type: "uploaded", localId: "a", uploadId: "up-1" });
    expect(state[0]).toMatchObject({ status: "uploaded", uploadId: "up-1" });

    state = photoDraftReducer(state, { type: "attached", uploadIds: ["up-1"] });
    expect(state[0]?.status).toBe("attached");
  });

  it("uploading -> waited で waiting に戻る", () => {
    const state = photoDraftReducer([item({ localId: "a", status: "uploading" })], {
      type: "waited",
      localId: "a",
    });
    expect(state[0]?.status).toBe("waiting");
  });

  it("failed: エラーコード付きで failed になる", () => {
    const state = photoDraftReducer([item({ localId: "a", status: "uploading" })], {
      type: "failed",
      localId: "a",
      errorCode: "network",
    });
    expect(state[0]).toMatchObject({ status: "failed", errorCode: "network" });
  });

  it("retried: prepared があれば waiting、無ければ processing", () => {
    const withPrepared = photoDraftReducer(
      [item({ localId: "a", status: "failed", prepared: PREPARED, errorCode: "network" })],
      { type: "retried", localId: "a" },
    );
    expect(withPrepared[0]).toMatchObject({ status: "waiting", errorCode: null });

    const withoutPrepared = photoDraftReducer(
      [item({ localId: "a", status: "failed", errorCode: "processing_failed" })],
      { type: "retried", localId: "a" },
    );
    expect(withoutPrepared[0]).toMatchObject({ status: "processing", errorCode: null });
  });

  it("removed: 通常は配列から消える", () => {
    const state = photoDraftReducer([item({ localId: "a" }), item({ localId: "b" })], {
      type: "removed",
      localId: "a",
    });
    expect(state.map((i) => i.localId)).toEqual(["b"]);
  });

  it("removed: attached は削除されない（無視）", () => {
    const state = photoDraftReducer([item({ localId: "a", status: "attached" })], {
      type: "removed",
      localId: "a",
    });
    expect(state).toHaveLength(1);
    expect(state[0]?.status).toBe("attached");
  });

  it("attached: 削除された localId が遅れて届いても復活しない", () => {
    const withoutA = photoDraftReducer([item({ localId: "b", status: "waiting" })], {
      type: "prepared",
      localId: "a",
      prepared: PREPARED,
    });
    expect(withoutA.map((i) => i.localId)).toEqual(["b"]);
  });

  it("attached 済みに failed / waited が来ても無視する", () => {
    const state = [item({ localId: "a", status: "attached", uploadId: "up-1" })];
    expect(
      photoDraftReducer(state, { type: "failed", localId: "a", errorCode: "network" })[0]?.status,
    ).toBe("attached");
    expect(photoDraftReducer(state, { type: "waited", localId: "a" })[0]?.status).toBe("attached");
  });
});

describe("heldUploadSlots", () => {
  it("uploading と uploaded の合計を数える", () => {
    const state = [
      item({ localId: "a", status: "uploading" }),
      item({ localId: "b", status: "uploaded" }),
      item({ localId: "c", status: "waiting" }),
      item({ localId: "d", status: "attached" }),
    ];
    expect(heldUploadSlots(state)).toBe(2);
  });
});

describe("nextPreuploadWork", () => {
  it("processing が最優先", () => {
    const state = [
      item({ localId: "a", status: "waiting" }),
      item({ localId: "b", status: "processing" }),
    ];
    expect(nextPreuploadWork(state, { limit: PIN_PHOTO_PREUPLOAD_MAX, paused: false })).toEqual({
      kind: "prepare",
      item: state[1],
    });
  });

  it("held が limit 以上なら transfer を返さない", () => {
    const state = Array.from({ length: PIN_PHOTO_PREUPLOAD_MAX }, (_, i) =>
      item({ localId: `held-${i}`, status: "uploaded" }),
    ).concat(item({ localId: "waiting-1", status: "waiting" }));
    expect(nextPreuploadWork(state, { limit: PIN_PHOTO_PREUPLOAD_MAX, paused: false })).toBeNull();
  });

  it("extraHeldSlots（PR #93 T11: 削除に失敗した幽霊枠）を加算して上限判定する", () => {
    const state = [
      item({ localId: "a", status: "uploaded" }),
      item({ localId: "waiting-1", status: "waiting" }),
    ];
    // 素の heldUploadSlots は1だが、extraHeldSlots(19) を加えると limit(20) に到達する。
    expect(nextPreuploadWork(state, { limit: 20, paused: false, extraHeldSlots: 19 })).toBeNull();
    // extraHeldSlots を渡さなければ（未指定=0扱い）通常どおり transfer を返す。
    expect(nextPreuploadWork(state, { limit: 20, paused: false })).toEqual({
      kind: "transfer",
      item: state[1],
    });
  });

  it("paused なら transfer を返さない（prepare は返す）", () => {
    const withProcessing = [
      item({ localId: "a", status: "processing" }),
      item({ localId: "b", status: "waiting" }),
    ];
    expect(nextPreuploadWork(withProcessing, { limit: 20, paused: true })).toEqual({
      kind: "prepare",
      item: withProcessing[0],
    });

    const onlyWaiting = [item({ localId: "a", status: "waiting" })];
    expect(nextPreuploadWork(onlyWaiting, { limit: 20, paused: true })).toBeNull();
  });

  it("failed / attached は飛ばす", () => {
    const state = [
      item({ localId: "a", status: "failed" }),
      item({ localId: "b", status: "attached" }),
    ];
    expect(nextPreuploadWork(state, { limit: 20, paused: false })).toBeNull();
  });
});

describe("nextAttachChunk", () => {
  it("35枚で先頭10枚、attached をスキップする", () => {
    const state = [
      ...Array.from({ length: 5 }, (_, i) =>
        item({ localId: `attached-${i}`, status: "attached" }),
      ),
      ...Array.from({ length: 35 }, (_, i) => item({ localId: `rest-${i}`, status: "uploaded" })),
    ];
    const chunk = nextAttachChunk(state, PIN_PHOTOS_PER_REQUEST_MAX);
    expect(chunk).toHaveLength(PIN_PHOTOS_PER_REQUEST_MAX);
    expect(chunk.map((i) => i.localId)).toEqual(
      Array.from({ length: PIN_PHOTOS_PER_REQUEST_MAX }, (_, i) => `rest-${i}`),
    );
  });

  it("failed も含める（runPinSave が扱う）", () => {
    const state = [
      item({ localId: "a", status: "failed" }),
      item({ localId: "b", status: "uploaded" }),
    ];
    const chunk = nextAttachChunk(state, PIN_PHOTOS_PER_REQUEST_MAX);
    expect(chunk.map((i) => i.localId)).toEqual(["a", "b"]);
  });
});

describe("photoDraftSummary / photoGridCaption", () => {
  it("状態ごとの件数を集計する", () => {
    const state = [
      item({ localId: "a", status: "attached" }),
      item({ localId: "b", status: "uploaded" }),
      item({ localId: "c", status: "waiting" }),
      item({ localId: "d", status: "processing" }),
      item({ localId: "e", status: "uploading" }),
      item({ localId: "f", status: "failed" }),
    ];
    expect(photoDraftSummary(state)).toEqual({
      total: 6,
      attached: 1,
      uploaded: 1,
      waiting: 1,
      inProgress: 2,
      failed: 1,
    });
  });

  it("100枚追加しても全件保持する", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ localId: `l-${i}`, picked: PICKED }));
    const state = photoDraftReducer([], { type: "added", items });
    expect(state).toHaveLength(100);
    expect(photoDraftSummary(state).total).toBe(100);
  });

  it("total が0なら null", () => {
    expect(photoGridCaption(photoDraftSummary([]))).toBeNull();
  });

  it("アップロード済みと待機が混在する例文", () => {
    const state = [
      ...Array.from({ length: 12 }, (_, i) => item({ localId: `done-${i}`, status: "attached" })),
      ...Array.from({ length: 23 }, (_, i) => item({ localId: `wait-${i}`, status: "waiting" })),
    ];
    expect(photoGridCaption(photoDraftSummary(state))).toBe(
      "12 枚アップロード済み・23 枚は保存時に送信します",
    );
  });

  it("アップロード中のみの例文", () => {
    const state = Array.from({ length: 3 }, (_, i) =>
      item({ localId: `up-${i}`, status: "uploading" }),
    );
    expect(photoGridCaption(photoDraftSummary(state))).toBe("3 枚をアップロード中");
  });
});
