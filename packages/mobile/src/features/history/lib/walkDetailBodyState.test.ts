import { describe, expect, it } from "vitest";

import {
  canDeleteWalk,
  type ResolveWalkDetailBodyStateInput,
  resolveWalkDetailBodyState,
} from "@/features/history/lib/walkDetailBodyState";

const BASE: ResolveWalkDetailBodyStateInput = {
  hasWalkId: true,
  deleteStatus: "idle",
  errorCode: null,
  isLoading: false,
  hasWalk: true,
};

describe("resolveWalkDetailBodyState", () => {
  it("hasWalkId:false かつ deleteStatus:idle → invalid-id", () => {
    expect(resolveWalkDetailBodyState({ ...BASE, hasWalkId: false })).toBe("invalid-id");
  });

  it("errorCode:not_found → not-found", () => {
    expect(resolveWalkDetailBodyState({ ...BASE, errorCode: "not_found" })).toBe("not-found");
  });

  it("errorCode:not_found 以外の非null → error", () => {
    expect(resolveWalkDetailBodyState({ ...BASE, errorCode: "server" })).toBe("error");
  });

  it("isLoading:false / hasWalk:false / エラー無し → loading（現行の isLoading || walk===null と同じ挙動）", () => {
    expect(resolveWalkDetailBodyState({ ...BASE, isLoading: false, hasWalk: false })).toBe(
      "loading",
    );
  });

  it("isLoading:true → loading", () => {
    expect(resolveWalkDetailBodyState({ ...BASE, isLoading: true, hasWalk: false })).toBe(
      "loading",
    );
  });

  it("エラー無し・ロード完了・walkあり → ready", () => {
    expect(resolveWalkDetailBodyState(BASE)).toBe("ready");
  });

  it("deleteStatus:deleted かつ errorCode:not_found → deleted（優先順位1の要）", () => {
    expect(
      resolveWalkDetailBodyState({ ...BASE, deleteStatus: "deleted", errorCode: "not_found" }),
    ).toBe("deleted");
  });

  it("deleteStatus:deleted かつ hasWalkId:false → deleted（invalid-idより優先）", () => {
    expect(resolveWalkDetailBodyState({ ...BASE, deleteStatus: "deleted", hasWalkId: false })).toBe(
      "deleted",
    );
  });

  it("deleteStatus:deleting かつ walk あり → ready（削除中も内容が消えない）", () => {
    expect(resolveWalkDetailBodyState({ ...BASE, deleteStatus: "deleting" })).toBe("ready");
  });

  it("deleteStatus:error かつ walk あり → ready（削除失敗時も本文は壊さず、失敗はダイアログ側が出す）", () => {
    expect(resolveWalkDetailBodyState({ ...BASE, deleteStatus: "error" })).toBe("ready");
  });
});

describe("canDeleteWalk", () => {
  it("ready のときだけ true", () => {
    expect(canDeleteWalk("ready")).toBe(true);
    expect(canDeleteWalk("loading")).toBe(false);
    expect(canDeleteWalk("error")).toBe(false);
    expect(canDeleteWalk("not-found")).toBe(false);
    expect(canDeleteWalk("invalid-id")).toBe(false);
    expect(canDeleteWalk("deleted")).toBe(false);
  });
});
