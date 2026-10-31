import { describe, expect, it } from "vitest";

import {
  PIN_ADDRESS_LOADING_LABEL,
  PIN_ADDRESS_UNAVAILABLE_LABEL,
  pinAddressCopyText,
  pinAddressText,
  toPinAddress,
} from "@/features/pin/lib/pinAddress";

describe("toPinAddress", () => {
  it("住所と建物名の前後の空白を除く", () => {
    expect(
      toPinAddress({ address: " 東京都千代田区丸の内2丁目4-1 ", buildingName: " 丸ビル " }),
    ).toEqual({ address: "東京都千代田区丸の内2丁目4-1", buildingName: "丸ビル" });
  });

  it("空の建物名は null", () => {
    expect(toPinAddress({ address: "東京都渋谷区", buildingName: "  " })).toEqual({
      address: "東京都渋谷区",
      buildingName: null,
    });
  });

  it("住所が無い・空なら、建物名があっても null", () => {
    expect(toPinAddress({ address: null, buildingName: "丸ビル" })).toBeNull();
    expect(toPinAddress({ address: "  ", buildingName: null })).toBeNull();
  });
});

describe("pinAddressText", () => {
  it("取得中は案内を出す", () => {
    expect(pinAddressText({ status: "loading", address: null })).toBe(PIN_ADDRESS_LOADING_LABEL);
  });

  it("住所の後ろに建物名を付ける", () => {
    expect(
      pinAddressText({
        status: "ready",
        address: { address: "東京都千代田区丸の内2丁目4-1", buildingName: "丸ビル" },
      }),
    ).toBe("東京都千代田区丸の内2丁目4-1 丸ビル");
  });

  it("建物名が無ければ住所だけ", () => {
    expect(
      pinAddressText({ status: "ready", address: { address: "東京都渋谷区", buildingName: null } }),
    ).toBe("東京都渋谷区");
  });

  it("住所が無い・失敗は「-」", () => {
    expect(pinAddressText({ status: "unavailable", address: null })).toBe("-");
    expect(PIN_ADDRESS_UNAVAILABLE_LABEL).toBe("-");
  });
});

describe("pinAddressCopyText", () => {
  it("住所が取れていれば、表示と同じ文字列（建物名付き）", () => {
    const address = { address: "東京都千代田区丸の内2丁目4-1", buildingName: "丸ビル" };
    expect(pinAddressCopyText({ status: "ready", address })).toBe(
      pinAddressText({ status: "ready", address }),
    );
    expect(pinAddressCopyText({ status: "ready", address })).toBe(
      "東京都千代田区丸の内2丁目4-1 丸ビル",
    );
  });

  it("取得中・住所が無いときは null（案内や「-」をコピーさせない）", () => {
    const address = { address: "東京都渋谷区", buildingName: null };
    expect(pinAddressCopyText({ status: "loading", address })).toBeNull();
    expect(pinAddressCopyText({ status: "ready", address: null })).toBeNull();
    expect(pinAddressCopyText({ status: "unavailable", address: null })).toBeNull();
  });
});
