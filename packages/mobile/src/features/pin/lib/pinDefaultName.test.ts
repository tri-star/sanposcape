import { describe, expect, it } from "vitest";

import {
  PIN_NAME_HELPER_DEFAULT,
  PIN_NAME_HELPER_FILLED,
  PIN_NAME_HELPER_LOADING,
  buildDefaultPinName,
  pinNameHelperText,
} from "@/features/pin/lib/pinDefaultName";
import { PIN_NAME_MAX_LENGTH } from "@/features/pin/lib/pinLimits";

describe("buildDefaultPinName", () => {
  it("住所と建物名をつなげて「付近」を付ける", () => {
    expect(
      buildDefaultPinName({ address: "東京都千代田区丸の内1丁目9-1", buildingName: "テストビル" }),
    ).toBe("東京都千代田区丸の内1丁目9-1 テストビル付近");
  });

  it("建物名が無ければ住所に「付近」を付ける", () => {
    expect(buildDefaultPinName({ address: "東京都渋谷区渋谷2丁目21-1", buildingName: null })).toBe(
      "東京都渋谷区渋谷2丁目21-1付近",
    );
    expect(buildDefaultPinName({ address: "東京都渋谷区", buildingName: "  " })).toBe(
      "東京都渋谷区付近",
    );
  });

  it("住所が無い・空なら null", () => {
    expect(buildDefaultPinName({ address: null, buildingName: "テストビル" })).toBeNull();
    expect(buildDefaultPinName({ address: "  ", buildingName: null })).toBeNull();
  });

  it("上限を超えるなら建物名を落とす", () => {
    const address = "北海道札幌市中央区北一条西2丁目1-1";
    const buildingName = "ビ".repeat(PIN_NAME_MAX_LENGTH);
    expect(buildDefaultPinName({ address, buildingName })).toBe(`${address}付近`);
  });

  it("建物名を落としても超えるなら住所を切り詰め、上限ちょうどに収める（code point で数える）", () => {
    const address = "😀".repeat(PIN_NAME_MAX_LENGTH);
    const name = buildDefaultPinName({ address, buildingName: null });
    expect(Array.from(name ?? "")).toHaveLength(PIN_NAME_MAX_LENGTH);
    expect(name?.endsWith("付近")).toBe(true);
  });

  it("上限ちょうどなら建物名を残す", () => {
    // 住所 + 半角スペース + 建物名 + 「付近」 = 上限
    const address = "あ".repeat(PIN_NAME_MAX_LENGTH - 2 - 1 - 3);
    expect(buildDefaultPinName({ address, buildingName: "ビル名" })).toBe(`${address} ビル名付近`);
  });
});

describe("pinNameHelperText", () => {
  it("初期値が入っていればその旨", () => {
    expect(pinNameHelperText({ status: "ready", isNameDefault: true, name: "x付近" })).toBe(
      PIN_NAME_HELPER_FILLED,
    );
  });

  it("取得中で名前が空なら取得中", () => {
    expect(pinNameHelperText({ status: "loading", isNameDefault: false, name: "" })).toBe(
      PIN_NAME_HELPER_LOADING,
    );
  });

  it("取得中でも入力済みなら既定の案内", () => {
    expect(pinNameHelperText({ status: "loading", isNameDefault: false, name: "桜" })).toBe(
      PIN_NAME_HELPER_DEFAULT,
    );
  });

  it("編集済み・取得できなかった・取得しないときは既定の案内", () => {
    expect(pinNameHelperText({ status: "ready", isNameDefault: false, name: "桜" })).toBe(
      PIN_NAME_HELPER_DEFAULT,
    );
    expect(pinNameHelperText({ status: "unavailable", isNameDefault: false, name: "" })).toBe(
      PIN_NAME_HELPER_DEFAULT,
    );
    expect(pinNameHelperText({ status: "idle", isNameDefault: false, name: "" })).toBe(
      PIN_NAME_HELPER_DEFAULT,
    );
  });
});
