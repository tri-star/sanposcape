import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  PinEditError,
  canManuallyRetryPinEdit,
  isPinEditError,
  isRetriablePinEditError,
  pinEditErrorMessage,
  pinEditProgressLabel,
  toPinEditErrorCode,
  type PinEditErrorCode,
  type PinEditStage,
} from "@/features/pin/lib/pinEditError";
import { PhotoSlotsBusyError, PinSaveError } from "@/features/pin/lib/pinSaveError";

const ALL_CODES: PinEditErrorCode[] = [
  "unauthorized",
  "forbidden",
  "pin_not_found",
  "sanpo_map_not_found",
  "tag_limit_exceeded",
  "photo_not_ready",
  "quota_exceeded",
  "photo_rejected",
  "photo_slots_busy",
  "invalid_request",
  "storage_unavailable",
  "network",
  "server",
  "unknown",
];
const ALL_STAGES: PinEditStage[] = ["update", "delete_photos", "add_photos"];

describe("isPinEditError", () => {
  it("ブランドで判定する", () => {
    expect(isPinEditError(new PinEditError("update", new Error("x")))).toBe(true);
    expect(isPinEditError(new Error("x"))).toBe(false);
    expect(isPinEditError(null)).toBe(false);
  });
});

describe("toPinEditErrorCode（update / delete_photos 段）", () => {
  for (const stage of ["update", "delete_photos"] as const) {
    describe(stage, () => {
      const classify = (cause: unknown) => toPinEditErrorCode(new PinEditError(stage, cause));

      it.each([
        [401, "unauthorized"],
        [403, "forbidden"],
        [404, "pin_not_found"],
        [413, "invalid_request"],
        [422, "invalid_request"],
        [503, "storage_unavailable"],
        [500, "server"],
        [502, "server"],
        [418, "unknown"],
      ] as const)("%d -> %s", (status, expected) => {
        expect(classify(new ApiError(status))).toBe(expected);
      });

      it("409 + code=tag_limit_exceeded は tag_limit_exceeded", () => {
        expect(classify(new ApiError(409, "x", { code: "tag_limit_exceeded" }))).toBe(
          "tag_limit_exceeded",
        );
      });

      it("409 で code が無い・別の値なら unknown", () => {
        expect(classify(new ApiError(409))).toBe("unknown");
        expect(classify(new ApiError(409, "x", { code: "other" }))).toBe("unknown");
      });

      it("TypeError は network、それ以外は unknown", () => {
        expect(classify(new TypeError("Network request failed"))).toBe("network");
        expect(classify(new Error("boom"))).toBe("unknown");
      });
    });
  }

  it("PinEditError で包まれていなければ update 段として扱う", () => {
    expect(toPinEditErrorCode(new ApiError(409, "x", { code: "tag_limit_exceeded" }))).toBe(
      "tag_limit_exceeded",
    );
    expect(toPinEditErrorCode(new ApiError(404))).toBe("pin_not_found");
  });

  it("update 段の 404 は code で区別する（sanpo_map_not_found 以外はピンが無い）", () => {
    expect(toPinEditErrorCode(new ApiError(404, "x", { code: "sanpo_map_not_found" }))).toBe(
      "sanpo_map_not_found",
    );
    expect(toPinEditErrorCode(new ApiError(404, "x", { code: "pin_not_found" }))).toBe(
      "pin_not_found",
    );
    expect(toPinEditErrorCode(new PinEditError("update", new ApiError(404)))).toBe("pin_not_found");
  });
});

describe("toPinEditErrorCode（add_photos 段）", () => {
  const classify = (cause: unknown) => toPinEditErrorCode(new PinEditError("add_photos", cause));
  const wrap = (cause: unknown) => new PinSaveError("add_photos", cause, "pin-1");

  it("PinSaveError に包まれた ApiError を pinSave と同じ規則で分類する", () => {
    expect(classify(wrap(new ApiError(401)))).toBe("unauthorized");
    expect(classify(wrap(new ApiError(403)))).toBe("forbidden");
    expect(classify(wrap(new ApiError(409)))).toBe("photo_not_ready");
    expect(classify(wrap(new ApiError(409, "x", { code: "storage_quota_exceeded" })))).toBe(
      "quota_exceeded",
    );
    expect(classify(wrap(new ApiError(422)))).toBe("invalid_request");
    expect(classify(wrap(new ApiError(503)))).toBe("storage_unavailable");
    expect(classify(wrap(new ApiError(500)))).toBe("server");
    expect(classify(wrap(new TypeError("x")))).toBe("network");
  });

  it("sanpo_map_not_found（404）は pin_not_found に写す", () => {
    expect(classify(wrap(new ApiError(404)))).toBe("pin_not_found");
  });

  it("404 に code が付いていても従来どおり pin_not_found", () => {
    expect(classify(wrap(new ApiError(404, "x", { code: "pin_not_found" })))).toBe("pin_not_found");
  });

  it("PhotoSlotsBusyError は photo_slots_busy", () => {
    expect(classify(wrap(new PhotoSlotsBusyError()))).toBe("photo_slots_busy");
  });
});

describe("pinEditErrorMessage", () => {
  it("全コード × 全 stage で文言が空でない", () => {
    for (const code of ALL_CODES) {
      for (const stage of ALL_STAGES) {
        expect(pinEditErrorMessage(code, stage).length).toBeGreaterThan(0);
      }
    }
  });

  it("update 段は「変更を保存できませんでした」、後段は一部保存済みであることを伝える", () => {
    expect(pinEditErrorMessage("network", "update")).toContain("変更を保存できませんでした");
    expect(pinEditErrorMessage("network", "delete_photos")).toContain("保存しました");
    expect(pinEditErrorMessage("network", "add_photos")).toContain("保存しました");
  });

  it("tag_limit_exceeded はタグを減らすよう案内する", () => {
    expect(pinEditErrorMessage("tag_limit_exceeded", "update")).toContain("タグを減らして");
  });
});

describe("sanpo_map_not_found（SS-175）", () => {
  it("update 段は地図の選び直しを案内する", () => {
    expect(pinEditErrorMessage("sanpo_map_not_found", "update")).toContain("地図を選び直して");
  });

  it("自動・手動のどちらの再試行にも入れない", () => {
    expect(isRetriablePinEditError("sanpo_map_not_found")).toBe(false);
    expect(canManuallyRetryPinEdit("sanpo_map_not_found")).toBe(false);
  });
});

describe("再試行の集合", () => {
  it("自動再試行は network / server / storage_unavailable / unknown だけ", () => {
    expect(ALL_CODES.filter(isRetriablePinEditError).sort()).toEqual(
      ["network", "server", "storage_unavailable", "unknown"].sort(),
    );
  });

  it("手動再試行は自動再試行 + photo_slots_busy + photo_rejected", () => {
    expect(ALL_CODES.filter(canManuallyRetryPinEdit).sort()).toEqual(
      [
        "network",
        "server",
        "storage_unavailable",
        "unknown",
        "photo_slots_busy",
        "photo_rejected",
      ].sort(),
    );
  });
});

describe("pinEditProgressLabel", () => {
  it("段ごとの文言", () => {
    expect(pinEditProgressLabel({ step: "updating" })).toBe("保存しています…");
    expect(pinEditProgressLabel({ step: "deleting_photos", done: 1, total: 3 })).toBe(
      "写真を削除中 1/3 枚",
    );
    expect(pinEditProgressLabel({ step: "sending_photos", sent: 2, total: 5 })).toBe(
      "写真を送信中 2/5 枚",
    );
  });
});
