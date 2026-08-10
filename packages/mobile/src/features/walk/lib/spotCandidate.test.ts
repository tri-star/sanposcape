import { describe, expect, it } from "vitest";

import type { PlaceCandidate } from "@/api/generated/model";
import {
  resolveSpotDisplayName,
  toRoundTripKm,
  toRoundTripMinutes,
  toSpotCandidate,
  toSpotCandidates,
} from "@/features/walk/lib/spotCandidate";

describe("resolveSpotDisplayName", () => {
  it("日本語名の前後空白を除去する", () => {
    expect(resolveSpotDisplayName("  緑町公園  ")).toBe("緑町公園");
  });

  it("日本語名がない場合の別言語名を維持する", () => {
    expect(resolveSpotDisplayName("Tokyo Station")).toBe("Tokyo Station");
  });

  it.each([undefined, null, 42, "   "])(
    "空または不正な値を目的地へフォールバックする: %j",
    (value) => {
      expect(resolveSpotDisplayName(value)).toBe("目的地");
    },
  );

  it("256 Unicode code point に切り詰め、絵文字を分断しない", () => {
    const result = resolveSpotDisplayName("😀".repeat(257));

    expect(Array.from(result)).toHaveLength(256);
    expect(result).toBe("😀".repeat(256));
  });

  it("極端に長い入力でも先頭256 Unicode code point だけを返す", () => {
    const result = resolveSpotDisplayName("😀".repeat(100_000));

    expect(Array.from(result)).toHaveLength(256);
    expect(result).toBe("😀".repeat(256));
  });
});

describe("toRoundTripMinutes", () => {
  it("90秒 → 2分", () => {
    expect(toRoundTripMinutes(90)).toBe(2);
  });

  it("30秒 → 1分（四捨五入）", () => {
    expect(toRoundTripMinutes(30)).toBe(1);
  });

  it("29秒 → 0分", () => {
    expect(toRoundTripMinutes(29)).toBe(0);
  });

  it("NaN/Infinity/負値は 0 になる", () => {
    expect(toRoundTripMinutes(Number.NaN)).toBe(0);
    expect(toRoundTripMinutes(Number.POSITIVE_INFINITY)).toBe(0);
    expect(toRoundTripMinutes(-100)).toBe(0);
  });
});

describe("toRoundTripKm", () => {
  it("1234m → 1.2km", () => {
    expect(toRoundTripKm(1234)).toBe(1.2);
  });

  it("NaN/Infinity/負値は 0 になる", () => {
    expect(toRoundTripKm(Number.NaN)).toBe(0);
    expect(toRoundTripKm(Number.POSITIVE_INFINITY)).toBe(0);
    expect(toRoundTripKm(-1)).toBe(0);
  });
});

const CANDIDATE: PlaceCandidate = {
  id: "place-1",
  name: "緑町公園",
  category: "park",
  location: { latitude: 35.0, longitude: 139.0 },
  round_trip_duration_seconds: 1200,
  round_trip_distance_meters: 1600,
};

describe("toSpotCandidate", () => {
  it("全フィールドを写す", () => {
    expect(toSpotCandidate(CANDIDATE)).toEqual({
      id: "place-1",
      name: "緑町公園",
      category: "park",
      location: { latitude: 35.0, longitude: 139.0 },
      roundTripMinutes: 20,
      roundTripKm: 1.6,
    });
  });

  it("空白のみの名前を目的地へフォールバックする", () => {
    expect(toSpotCandidate({ ...CANDIDATE, name: "  " }).name).toBe("目的地");
  });
});

describe("toSpotCandidates", () => {
  it("入力順を保つ（並べ替えない）", () => {
    const second: PlaceCandidate = { ...CANDIDATE, id: "place-2", name: "駅前広場" };
    const result = toSpotCandidates([CANDIDATE, second]);
    expect(result.map((s) => s.id)).toEqual(["place-1", "place-2"]);
  });

  it("空配列なら空配列", () => {
    expect(toSpotCandidates([])).toEqual([]);
  });
});
