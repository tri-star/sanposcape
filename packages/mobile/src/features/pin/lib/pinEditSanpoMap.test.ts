import { describe, expect, it } from "vitest";

import {
  PIN_EDIT_SANPO_MAP_LOCKED_HELPER,
  pinEditSavedMessage,
  resolveEffectivePinEditSanpoMapId,
  resolveMovedSanpoMapName,
  resolvePinEditSanpoMapChoices,
} from "@/features/pin/lib/pinEditSanpoMap";
import { DEFAULT_SANPO_MAP_ICON } from "@/features/pin/lib/sanpoMapIcon";
import type { SanpoMap } from "@/features/pin/types";

const MAP_A: SanpoMap = {
  id: "map-a",
  name: "地図A",
  isDefault: true,
  role: "owner",
  pinCount: null,
  icon: "coffee",
};
const MAP_B: SanpoMap = {
  id: "map-b",
  name: "地図B",
  isDefault: false,
  role: "owner",
  pinCount: null,
  icon: "cat",
};

describe("resolveEffectivePinEditSanpoMapId", () => {
  const base = { maps: [MAP_A, MAP_B], baselineSanpoMapId: "map-a" };

  it("下書きが基準値と同じなら基準値", () => {
    expect(
      resolveEffectivePinEditSanpoMapId({ ...base, status: "ready", draftSanpoMapId: "map-a" }),
    ).toBe("map-a");
  });

  it("ready で一覧にある地図なら下書き", () => {
    expect(
      resolveEffectivePinEditSanpoMapId({ ...base, status: "ready", draftSanpoMapId: "map-b" }),
    ).toBe("map-b");
  });

  it("一覧に無い地図は基準値に戻す", () => {
    expect(
      resolveEffectivePinEditSanpoMapId({ ...base, status: "ready", draftSanpoMapId: "map-x" }),
    ).toBe("map-a");
  });

  it.each(["loading", "error"] as const)("%s のときは基準値に戻す", (status) => {
    expect(resolveEffectivePinEditSanpoMapId({ ...base, status, draftSanpoMapId: "map-b" })).toBe(
      "map-a",
    );
  });
});

describe("resolvePinEditSanpoMapChoices", () => {
  const base = {
    maps: [MAP_A, MAP_B],
    current: { id: "map-a", name: "地図A" },
    selectedSanpoMapId: "map-a",
    canChange: true,
  };

  it("loading: choices は空で読み込み文言", () => {
    const state = resolvePinEditSanpoMapChoices({ ...base, status: "loading" });
    expect(state.status).toBe("loading");
    expect(state.choices).toEqual([]);
    expect(state.helper).toContain("読み込んでいます");
  });

  it("error: 今の地図だけを選択済みで出し、エラー文言を返す", () => {
    const state = resolvePinEditSanpoMapChoices({ ...base, status: "error" });
    expect(state.status).toBe("error");
    expect(state.choices).toHaveLength(1);
    expect(state.choices[0]).toMatchObject({ key: "map-a", label: "地図A", selected: true });
    expect(state.helper).toContain("再読み込み");
  });

  it("ready: 一覧の順を保ち、今の地図が selected。helper は無い", () => {
    const state = resolvePinEditSanpoMapChoices({ ...base, status: "ready" });
    expect(state.choices.map((c) => [c.key, c.selected])).toEqual([
      ["map-a", true],
      ["map-b", false],
    ]);
    expect(state.helper).toBeNull();
  });

  it("各チップは key=地図 id・isDraft=false・icon・existing 選択（既定地図も）", () => {
    const state = resolvePinEditSanpoMapChoices({ ...base, status: "ready" });
    expect(state.choices[0]).toMatchObject({
      key: "map-a",
      isDraft: false,
      icon: "coffee",
      selection: { kind: "existing", sanpoMapId: "map-a" },
    });
    expect(state.choices[1]?.selection).toEqual({ kind: "existing", sanpoMapId: "map-b" });
  });

  it("今の地図が一覧に無ければ先頭に足す（名前は current・アイコンは既定）", () => {
    const state = resolvePinEditSanpoMapChoices({
      ...base,
      status: "ready",
      maps: [MAP_B],
      current: { id: "map-gone", name: "消えた地図" },
      selectedSanpoMapId: "map-gone",
    });
    expect(state.choices[0]).toMatchObject({
      key: "map-gone",
      label: "消えた地図",
      icon: DEFAULT_SANPO_MAP_ICON,
      selected: true,
    });
    expect(state.choices).toHaveLength(2);
  });

  it("別の地図を選ぶと移動の案内を出す", () => {
    const state = resolvePinEditSanpoMapChoices({
      ...base,
      status: "ready",
      selectedSanpoMapId: "map-b",
    });
    expect(state.choices.find((c) => c.selected)?.key).toBe("map-b");
    expect(state.helper).toBe("保存すると「地図B」に移動します");
  });

  it("canChange=false は選択が違っても LOCKED_HELPER を優先する", () => {
    const state = resolvePinEditSanpoMapChoices({
      ...base,
      status: "ready",
      selectedSanpoMapId: "map-b",
      canChange: false,
    });
    expect(state.helper).toBe(PIN_EDIT_SANPO_MAP_LOCKED_HELPER);
  });
});

describe("resolveMovedSanpoMapName", () => {
  it("開いた時点と違う地図なら応答の地図名", () => {
    expect(
      resolveMovedSanpoMapName({
        originalSanpoMapId: "map-a",
        updated: { sanpoMapId: "map-b", sanpoMapName: "地図B" },
      }),
    ).toBe("地図B");
  });

  it("同じ地図なら null", () => {
    expect(
      resolveMovedSanpoMapName({
        originalSanpoMapId: "map-a",
        updated: { sanpoMapId: "map-a", sanpoMapName: "地図A" },
      }),
    ).toBeNull();
  });
});

describe("pinEditSavedMessage", () => {
  it("移動していなければ「ピンを更新しました」", () => {
    expect(pinEditSavedMessage(null)).toBe("ピンを更新しました");
  });

  it("移動したら移動先の名前を入れる", () => {
    expect(pinEditSavedMessage("地図B")).toBe("ピンを「地図B」に移動しました");
  });
});
