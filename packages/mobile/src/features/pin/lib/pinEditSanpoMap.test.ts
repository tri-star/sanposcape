import { describe, expect, it } from "vitest";

import {
  INITIAL_PIN_EDIT_UPDATE_RECORD,
  PIN_EDIT_SANPO_MAP_ERROR_HELPER,
  PIN_EDIT_SANPO_MAP_LOADING_HELPER,
  pinEditSanpoMapLockedHelper,
  pinEditSanpoMapMoveHelper,
  pinEditSavedMessage,
  recordPinEditUpdate,
  resolveDraftSanpoMapReset,
  resolveEffectivePinEditSanpoMapId,
  resolveMovedSanpoMapName,
  resolvePinEditSanpoMapChoices,
  shouldInvalidateSanpoMapsAfterSave,
  type PinEditUpdateRecord,
} from "@/features/pin/lib/pinEditSanpoMap";
import { DEFAULT_SANPO_MAP_ICON } from "@/features/pin/lib/sanpoMapIcon";
import type { PinDetail, SanpoMap } from "@/features/pin/types";

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
    expect(state.helper).toBe(PIN_EDIT_SANPO_MAP_LOADING_HELPER);
  });

  it("error: 今の地図だけを選択済みで出し、エラー文言を返す", () => {
    const state = resolvePinEditSanpoMapChoices({ ...base, status: "error" });
    expect(state.status).toBe("error");
    expect(state.choices).toHaveLength(1);
    expect(state.choices[0]).toMatchObject({ key: "map-a", label: "地図A", selected: true });
    expect(state.helper).toBe(PIN_EDIT_SANPO_MAP_ERROR_HELPER);
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
    expect(state.helper).toBe(pinEditSanpoMapMoveHelper("地図B"));
  });

  it("error × canChange=false: 閲覧のみと断定せず、同じ再読み込みの案内にする", () => {
    const state = resolvePinEditSanpoMapChoices({ ...base, status: "error", canChange: false });
    expect(state.helper).toBe(PIN_EDIT_SANPO_MAP_ERROR_HELPER);
  });

  it("loading × canChange=false でも choices は空で読み込み文言", () => {
    const state = resolvePinEditSanpoMapChoices({ ...base, status: "loading", canChange: false });
    expect(state.choices).toEqual([]);
    expect(state.helper).toBe(PIN_EDIT_SANPO_MAP_LOADING_HELPER);
  });

  it("今の地図が一覧に無く別の地図を選ぶと、先頭の今の地図は未選択で移動の案内を出す", () => {
    const state = resolvePinEditSanpoMapChoices({
      ...base,
      status: "ready",
      maps: [MAP_B],
      current: { id: "map-gone", name: "消えた地図" },
      selectedSanpoMapId: "map-b",
    });
    expect(state.choices.map((c) => [c.key, c.selected])).toEqual([
      ["map-gone", false],
      ["map-b", true],
    ]);
    expect(state.helper).toBe(pinEditSanpoMapMoveHelper("地図B"));
  });

  it("選択 ID が一覧にも current にも無いと、どれも未選択で移動の案内は出ない", () => {
    const state = resolvePinEditSanpoMapChoices({
      ...base,
      status: "ready",
      selectedSanpoMapId: "map-x",
    });
    expect(state.choices.some((c) => c.selected)).toBe(false);
    expect(state.helper).toBeNull();
  });

  it("canChange=false は選択が違っても LOCKED_HELPER を優先する", () => {
    const state = resolvePinEditSanpoMapChoices({
      ...base,
      status: "ready",
      selectedSanpoMapId: "map-b",
      canChange: false,
    });
    expect(state.helper).toBe(pinEditSanpoMapLockedHelper("地図A"));
  });
});

describe("resolveDraftSanpoMapReset", () => {
  const base = { maps: [MAP_A, MAP_B], baselineSanpoMapId: "map-a" };

  it("ready で下書きの地図が一覧に無ければ基準値の ID（消えた地図を下書きに残さない）", () => {
    expect(resolveDraftSanpoMapReset({ ...base, status: "ready", draftSanpoMapId: "map-x" })).toBe(
      "map-a",
    );
  });

  it("ready で一覧にある地図なら戻さない", () => {
    expect(
      resolveDraftSanpoMapReset({ ...base, status: "ready", draftSanpoMapId: "map-b" }),
    ).toBeNull();
  });

  it("下書きが基準値と同じなら（基準値の地図が一覧に無くても）戻さない", () => {
    expect(
      resolveDraftSanpoMapReset({
        status: "ready",
        maps: [MAP_B],
        baselineSanpoMapId: "map-a",
        draftSanpoMapId: "map-a",
      }),
    ).toBeNull();
  });

  it.each(["loading", "error"] as const)("%s のときは確かめられないので戻さない", (status) => {
    expect(resolveDraftSanpoMapReset({ ...base, status, draftSanpoMapId: "map-x" })).toBeNull();
  });
});

describe("PATCH の成功記録（recordPinEditUpdate / 移動の判定）", () => {
  const detailIn = (map: SanpoMap): PinDetail =>
    ({ sanpoMapId: map.id, sanpoMapName: map.name }) as PinDetail;
  const success = (
    record: PinEditUpdateRecord,
    request: { sanpo_map_id?: string },
    map: SanpoMap,
  ) => recordPinEditUpdate(record, { request, updated: detailIn(map) });
  /** 保存成功時にトーストへ出す移動先（usePinEdit の onSaved と同じ合成）。 */
  const toast = (record: PinEditUpdateRecord, originalSanpoMapId: string) =>
    resolveMovedSanpoMapName({ originalSanpoMapId, lastUpdated: record.lastUpdated });

  it("PATCH が一度も成功していなければ、一覧は取り直さずトーストは移動なし", () => {
    const record = INITIAL_PIN_EDIT_UPDATE_RECORD;
    expect(shouldInvalidateSanpoMapsAfterSave(record)).toBe(false);
    expect(toast(record, "map-a")).toBeNull();
  });

  it("地図を載せない PATCH だけなら一覧は取り直さず、トーストは移動なし", () => {
    const record = success(INITIAL_PIN_EDIT_UPDATE_RECORD, {}, MAP_A);
    expect(shouldInvalidateSanpoMapsAfterSave(record)).toBe(false);
    expect(toast(record, "map-a")).toBeNull();
  });

  it("A → B に移した保存は、一覧を取り直し、移動先の名前を出す", () => {
    const record = success(INITIAL_PIN_EDIT_UPDATE_RECORD, { sanpo_map_id: "map-b" }, MAP_B);
    expect(shouldInvalidateSanpoMapsAfterSave(record)).toBe(true);
    expect(toast(record, "map-a")).toBe("地図B");
  });

  it("部分保存で A → B に移り、写真だけの再保存（PATCH 成功なし）でも B を出し、一覧も取り直す", () => {
    const partial = success(INITIAL_PIN_EDIT_UPDATE_RECORD, { sanpo_map_id: "map-b" }, MAP_B);
    // 再保存では PATCH が走らない（isUpdated 済み等）ので記録は変わらない。
    expect(shouldInvalidateSanpoMapsAfterSave(partial)).toBe(true);
    expect(toast(partial, "map-a")).toBe("地図B");
  });

  it("部分保存で A → B の後、地図以外だけの PATCH で再保存しても B のまま・一覧の取り直しも残る", () => {
    const partial = success(INITIAL_PIN_EDIT_UPDATE_RECORD, { sanpo_map_id: "map-b" }, MAP_B);
    const resaved = success(partial, {}, MAP_B);
    expect(shouldInvalidateSanpoMapsAfterSave(resaved)).toBe(true);
    expect(toast(resaved, "map-a")).toBe("地図B");
  });

  it("A → B の後に B → A へ戻して保存すると、トーストは移動なしだが一覧は取り直す（並びが変わる）", () => {
    const moved = success(INITIAL_PIN_EDIT_UPDATE_RECORD, { sanpo_map_id: "map-b" }, MAP_B);
    const back = success(moved, { sanpo_map_id: "map-a" }, MAP_A);
    expect(shouldInvalidateSanpoMapsAfterSave(back)).toBe(true);
    expect(toast(back, "map-a")).toBeNull();
  });

  it("記録は元の値を書き換えない", () => {
    success(INITIAL_PIN_EDIT_UPDATE_RECORD, { sanpo_map_id: "map-b" }, MAP_B);
    expect(INITIAL_PIN_EDIT_UPDATE_RECORD).toEqual({
      sanpoMapChangeSent: false,
      lastUpdated: null,
    });
  });
});

describe("resolveMovedSanpoMapName", () => {
  it("開いた時点と違う地図なら応答の地図名", () => {
    expect(
      resolveMovedSanpoMapName({
        originalSanpoMapId: "map-a",
        lastUpdated: { sanpoMapId: "map-b", sanpoMapName: "地図B" },
      }),
    ).toBe("地図B");
  });

  it("同じ地図なら null", () => {
    expect(
      resolveMovedSanpoMapName({
        originalSanpoMapId: "map-a",
        lastUpdated: { sanpoMapId: "map-a", sanpoMapName: "地図A" },
      }),
    ).toBeNull();
  });

  it("応答が無ければ null", () => {
    expect(resolveMovedSanpoMapName({ originalSanpoMapId: "map-a", lastUpdated: null })).toBeNull();
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
