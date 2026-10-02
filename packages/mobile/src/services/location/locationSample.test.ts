import { describe, expect, it } from "vitest";

import {
  decodeLocationSamples,
  encodeLocationSamples,
  toLocationSamples,
} from "@/services/location/locationSample";
import type { LocationSample } from "@/services/location/types";

function loc(lat: unknown, lng: unknown, timestamp: unknown, accuracy?: unknown) {
  return { coords: { latitude: lat, longitude: lng, accuracy }, timestamp };
}

describe("toLocationSamples", () => {
  it("locations から順序を保って LocationSample[] になる（accuracy → accuracyMeters）", () => {
    const samples = toLocationSamples({
      locations: [loc(35.1, 139.1, 1000, 5), loc(35.2, 139.2, 2000, 12.5)],
    });
    expect(samples).toEqual([
      { latitude: 35.1, longitude: 139.1, timestampMs: 1000, accuracyMeters: 5 },
      { latitude: 35.2, longitude: 139.2, timestampMs: 2000, accuracyMeters: 12.5 },
    ]);
  });

  it.each([null, undefined, 1, "x", [], {}, { locations: "x" }, { locations: null }])(
    "data が %j のときは []",
    (data) => {
      expect(toLocationSamples(data)).toEqual([]);
    },
  );

  it("不正な座標・時刻の点は捨て、残りは返す", () => {
    const samples = toLocationSamples({
      locations: [
        loc(Number.NaN, 139, 1),
        loc(35, Number.POSITIVE_INFINITY, 2),
        loc(91, 139, 3),
        loc(35, 181, 4),
        loc(35, 139, Number.NaN),
        loc(35, 139, "5"),
        null,
        { timestamp: 6 },
        loc(35.5, 139.5, 7),
      ],
    });
    expect(samples).toEqual([
      { latitude: 35.5, longitude: 139.5, timestampMs: 7, accuracyMeters: null },
    ]);
  });

  it.each([[-1], [Number.NaN], ["5"], [undefined]])("accuracy が %j なら null", (accuracy) => {
    const [sample] = toLocationSamples({ locations: [loc(35, 139, 1, accuracy)] });
    expect(sample?.accuracyMeters).toBeNull();
  });
});

describe("encodeLocationSamples / decodeLocationSamples", () => {
  const samples: LocationSample[] = [
    { latitude: 35.681236, longitude: 139.767125, timestampMs: 1727850000000, accuracyMeters: 5 },
    { latitude: 35.7, longitude: 139.8, timestampMs: 1727850003000, accuracyMeters: null },
  ];

  it("往復できる（acc: null を含む）", () => {
    const raw = encodeLocationSamples(samples);
    expect(raw.startsWith("\n")).toBe(true);
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.split("\n").filter(Boolean)).toHaveLength(2);
    expect(decodeLocationSamples(raw)).toEqual(samples);
  });

  it("行の形式は短縮キー", () => {
    expect(encodeLocationSamples([samples[0]!])).toBe(
      '\n{"t":1727850000000,"lat":35.681236,"lng":139.767125,"acc":5}\n',
    );
  });

  it("複数回の追記を連結しても復号できる", () => {
    const raw = encodeLocationSamples([samples[0]!]) + encodeLocationSamples([samples[1]!]);
    expect(decodeLocationSamples(raw)).toEqual(samples);
  });

  it("書きかけで途切れた行に次の追記が続いても、次の有効な行は失われない", () => {
    // 前回の追記が改行なしで途切れた状態（クラッシュ・強制終了）。
    const torn = '\n{"t":1727850000000,"lat":35.68,"lng":139.7';
    const raw = torn + encodeLocationSamples([samples[1]!]);
    expect(decodeLocationSamples(raw)).toEqual([samples[1]]);
  });

  it("CRLF 区切りでも復号できる", () => {
    const raw = encodeLocationSamples(samples).replaceAll("\n", "\r\n");
    expect(decodeLocationSamples(raw)).toEqual(samples);
  });

  it.each([[null], [""]])("decode(%j) は []", (raw) => {
    expect(decodeLocationSamples(raw)).toEqual([]);
  });

  it("壊れた行・不正値の行は捨てて残りを返す", () => {
    const good = encodeLocationSamples([samples[0]!]);
    const raw =
      good +
      '{"t":1,"lat":999,"lng":0,"acc":null}\n' + // 範囲外
      "[1,2]\n" + // object でない
      '{"t":1,"lat":35,"lng":139,"acc":nu'; // 途中で切れた最終行
    expect(decodeLocationSamples(raw)).toEqual([samples[0]]);
  });

  it("encode([]) は空文字（空の追記で改行だけ書かない）", () => {
    expect(encodeLocationSamples([])).toBe("");
  });
});
