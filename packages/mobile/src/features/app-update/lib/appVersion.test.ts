import { describe, expect, it } from "vitest";

import {
  compareAppVersions,
  isBelowMinimumVersion,
  parseAppVersion,
} from "@/features/app-update/lib/appVersion";

describe("parseAppVersion", () => {
  it("X.Y.Z を数値の組にする", () => {
    expect(parseAppVersion("0.1.0")).toEqual([0, 1, 0]);
    expect(parseAppVersion("12.34.56")).toEqual([12, 34, 56]);
  });

  it.each([
    "",
    "1",
    "1.2",
    "1.2.3.4",
    "v1.2.3",
    " 1.2.3",
    "1.2.3 ",
    "1.2.3-beta",
    "1.a.3",
    "-1.2.3",
  ])("形式が違えば null: %j", (raw) => {
    expect(parseAppVersion(raw)).toBeNull();
  });

  it("安全な整数を超える桁は null", () => {
    expect(parseAppVersion("99999999999999999999.0.0")).toBeNull();
  });
});

describe("compareAppVersions", () => {
  it("文字列ではなく数値で比べる", () => {
    expect(compareAppVersions([0, 10, 0], [0, 9, 0])).toBeGreaterThan(0);
    expect(compareAppVersions([1, 0, 0], [0, 99, 99])).toBeGreaterThan(0);
    expect(compareAppVersions([0, 1, 2], [0, 1, 10])).toBeLessThan(0);
  });

  it("等しければ 0", () => {
    expect(compareAppVersions([1, 2, 3], [1, 2, 3])).toBe(0);
  });
});

describe("isBelowMinimumVersion", () => {
  it("最低バージョンより古ければ true", () => {
    expect(isBelowMinimumVersion({ currentVersion: "0.1.0", minimumVersion: "0.2.0" })).toBe(true);
  });

  it("最低バージョンと同じか新しければ false", () => {
    expect(isBelowMinimumVersion({ currentVersion: "0.2.0", minimumVersion: "0.2.0" })).toBe(false);
    expect(isBelowMinimumVersion({ currentVersion: "0.10.0", minimumVersion: "0.9.0" })).toBe(
      false,
    );
  });

  it("最低バージョンの指定なし（null）なら false", () => {
    expect(isBelowMinimumVersion({ currentVersion: "0.1.0", minimumVersion: null })).toBe(false);
  });

  it("実行中のバージョンが取れない・形式不正なら false（強制しない側に倒す）", () => {
    expect(isBelowMinimumVersion({ currentVersion: null, minimumVersion: "9.0.0" })).toBe(false);
    expect(isBelowMinimumVersion({ currentVersion: "dev", minimumVersion: "9.0.0" })).toBe(false);
  });

  it("最低バージョンが形式不正なら false", () => {
    expect(isBelowMinimumVersion({ currentVersion: "0.1.0", minimumVersion: "9" })).toBe(false);
  });
});
