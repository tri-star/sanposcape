import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { S3UploadError } from "@/features/pin/lib/photoUploadError";
import {
  PhotoSlotsBusyError,
  PinSaveError,
  canManuallyRetryPinSave,
  isRetriablePinSaveError,
  pinSaveErrorMessage,
  pinSaveProgressLabel,
  toPinSaveErrorCode,
} from "@/features/pin/lib/pinSaveError";
import type { PinSaveErrorCode, PinSaveStage } from "@/features/pin/lib/pinSaveError";
import { PhotoError } from "@/services/photo/photoError";

describe("toPinSaveErrorCode", () => {
  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "sanpo_map_not_found"],
    [409, "photo_not_ready"],
    [413, "invalid_request"],
    [422, "invalid_request"],
    [500, "server"],
    [503, "storage_unavailable"],
  ] as const)("ApiError(%d) -> %s", (status, expected) => {
    expect(toPinSaveErrorCode(new ApiError(status))).toBe(expected);
  });

  it("TypeError -> network", () => {
    expect(toPinSaveErrorCode(new TypeError("fetch failed"))).toBe("network");
  });

  it("PhotoSlotsBusyError -> photo_slots_busy", () => {
    expect(toPinSaveErrorCode(new PhotoSlotsBusyError())).toBe("photo_slots_busy");
  });

  it("PinSaveError で包まれていても cause から分類する", () => {
    const wrapped = new PinSaveError("create", new ApiError(401), null);
    expect(toPinSaveErrorCode(wrapped)).toBe("unauthorized");
  });

  it("409 は本文の code で quota_exceeded / photo_not_ready を区別する（PR #93 T15）", () => {
    expect(
      toPinSaveErrorCode(
        new ApiError(409, undefined, { detail: "x", code: "storage_quota_exceeded" }),
      ),
    ).toBe("quota_exceeded");
    expect(
      toPinSaveErrorCode(
        new ApiError(409, undefined, { detail: "x", code: "photo_upload_not_ready" }),
      ),
    ).toBe("photo_not_ready");
  });

  it("409 で body が無い・code が不明な値のときは安全側で photo_not_ready", () => {
    expect(toPinSaveErrorCode(new ApiError(409))).toBe("photo_not_ready");
    expect(toPinSaveErrorCode(new ApiError(409, undefined, { code: "unknown_code" }))).toBe(
      "photo_not_ready",
    );
  });

  it("写真送信由来の cause: too_large 系は photo_rejected に写す", () => {
    expect(toPinSaveErrorCode(new ApiError(413))).toBe("invalid_request");
    expect(toPinSaveErrorCode(new S3UploadError(400, "EntityTooLarge"))).toBe("photo_rejected");
    expect(toPinSaveErrorCode(new PhotoError("processing_failed"))).toBe("photo_rejected");
  });

  it("S3 403（署名期限切れ）は network 扱い（新しい枠を取り直せば回復するため）", () => {
    expect(toPinSaveErrorCode(new S3UploadError(403, "AccessDenied"))).toBe("network");
  });

  it("その他の例外は unknown", () => {
    expect(toPinSaveErrorCode(new Error("boom"))).toBe("unknown");
  });
});

describe("isRetriablePinSaveError / canManuallyRetryPinSave", () => {
  const codes: PinSaveErrorCode[] = [
    "unauthorized",
    "forbidden",
    "sanpo_map_not_found",
    "photo_not_ready",
    "quota_exceeded",
    "invalid_request",
    "storage_unavailable",
    "photo_rejected",
    "photo_slots_busy",
    "network",
    "server",
    "unknown",
  ];
  const autoRetriable = new Set<PinSaveErrorCode>([
    "network",
    "server",
    "storage_unavailable",
    "unknown",
  ]);
  const manualRetriable = new Set<PinSaveErrorCode>([
    ...autoRetriable,
    "photo_slots_busy",
    "photo_rejected",
  ]);

  it.each(codes)("%s の自動再試行可否", (code) => {
    expect(isRetriablePinSaveError(code)).toBe(autoRetriable.has(code));
  });

  it.each(codes)("%s の手動再試行可否", (code) => {
    expect(canManuallyRetryPinSave(code)).toBe(manualRetriable.has(code));
  });

  it("unauthorized は自動再試行不可（サインインが唯一の前進手段）", () => {
    expect(isRetriablePinSaveError("unauthorized")).toBe(false);
  });
});

describe("pinSaveErrorMessage", () => {
  const codes: PinSaveErrorCode[] = [
    "unauthorized",
    "forbidden",
    "sanpo_map_not_found",
    "photo_not_ready",
    "quota_exceeded",
    "invalid_request",
    "storage_unavailable",
    "photo_rejected",
    "photo_slots_busy",
    "network",
    "server",
    "unknown",
  ];
  const stages: PinSaveStage[] = ["create", "add_photos"];

  for (const stage of stages) {
    it.each(codes)(`%s x ${stage} に文言がある`, (code) => {
      expect(pinSaveErrorMessage(code, stage).length).toBeGreaterThan(0);
    });
  }

  it("add_photos 段階はピンが保存済みである旨の前置きを含む", () => {
    expect(pinSaveErrorMessage("network", "add_photos")).toContain("ピンは保存しました");
  });
});

describe("pinSaveProgressLabel", () => {
  it("creating は「保存しています…」", () => {
    expect(pinSaveProgressLabel({ step: "creating" })).toBe("保存しています…");
  });

  it("sending_photos は sent/total を表示する", () => {
    expect(pinSaveProgressLabel({ step: "sending_photos", sent: 3, total: 35 })).toBe(
      "写真を送信中 3/35 枚",
    );
  });
});
