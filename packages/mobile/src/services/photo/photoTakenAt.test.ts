import { describe, expect, it } from "vitest";

import {
  extractTakenAtFromExif,
  formatTakenAt,
  parseExifDateTime,
  parseExifOffset,
  takenAtFromDate,
} from "@/services/photo/photoTakenAt";

const JST = { localOffsetMinutes: () => 540, now: new Date("2026-10-10T00:00:00Z") };

describe("extractTakenAtFromExif", () => {
  it("DateTimeOriginal と OffsetTimeOriginal から作る", () => {
    expect(
      extractTakenAtFromExif(
        { DateTimeOriginal: "2026:07:02 09:14:05", OffsetTimeOriginal: "+09:00" },
        JST,
      ),
    ).toBe("2026-07-02T09:14:05+09:00");
  });

  it("オフセットが無ければ端末のオフセットで補う（Android 相当）", () => {
    expect(extractTakenAtFromExif({ DateTimeOriginal: "2026:07:02 09:14:05" }, JST)).toBe(
      "2026-07-02T09:14:05+09:00",
    );
  });

  it("負のオフセット・30分単位を扱う", () => {
    expect(
      extractTakenAtFromExif(
        { DateTimeOriginal: "2026:07:02 09:14:05", OffsetTimeOriginal: "-03:30" },
        JST,
      ),
    ).toBe("2026-07-02T09:14:05-03:30");
  });

  it("Original が無ければ Digitized を使う", () => {
    expect(
      extractTakenAtFromExif(
        { DateTimeDigitized: "2026:07:02 09:14:05", OffsetTimeDigitized: "+09:00" },
        JST,
      ),
    ).toBe("2026-07-02T09:14:05+09:00");
  });

  it("Original のオフセットを Digitized に流用しない", () => {
    expect(
      extractTakenAtFromExif(
        { DateTimeDigitized: "2026:07:02 09:14:05", OffsetTimeOriginal: "-05:00" },
        JST,
      ),
    ).toBe("2026-07-02T09:14:05+09:00");
  });

  it("Original が不正なら Digitized にフォールバックする", () => {
    expect(
      extractTakenAtFromExif(
        { DateTimeOriginal: "0000:00:00 00:00:00", DateTimeDigitized: "2026:07:02 09:14:05" },
        JST,
      ),
    ).toBe("2026-07-02T09:14:05+09:00");
  });

  it("TIFF の DateTime だけでは null", () => {
    expect(extractTakenAtFromExif({ DateTime: "2026:07:02 09:14:05" }, JST)).toBeNull();
  });

  it.each(["2026:07:02 09:14:05.123", "2026:07:02 09:14:05\u0000", " 2026:07:02 09:14:05 "])(
    "サブ秒・空白・NUL を無視する: %j",
    (value) => {
      expect(extractTakenAtFromExif({ DateTimeOriginal: value }, JST)).toBe(
        "2026-07-02T09:14:05+09:00",
      );
    },
  );

  it.each([
    "0000:00:00 00:00:00",
    "    :  :     :  :  ",
    "",
    "2026:02:30 10:00:00",
    "2026:07:02 24:00:00",
  ])("不明値・不正値は null: %j", (value) => {
    expect(extractTakenAtFromExif({ DateTimeOriginal: value }, JST)).toBeNull();
  });

  it.each(["+9:00", "+15:00", "JST", "+09:60"])(
    "オフセットが不正なら端末の値で補う: %j",
    (offset) => {
      expect(
        extractTakenAtFromExif(
          { DateTimeOriginal: "2026:07:02 09:14:05", OffsetTimeOriginal: offset },
          JST,
        ),
      ).toBe("2026-07-02T09:14:05+09:00");
    },
  );

  it("範囲外（下端・上端）は null", () => {
    const utc = { ...JST, localOffsetMinutes: () => 0 };
    expect(extractTakenAtFromExif({ DateTimeOriginal: "1899:12:31 23:59:59" }, utc)).toBeNull();
    expect(extractTakenAtFromExif({ DateTimeOriginal: "2100:01:01 00:00:00" }, utc)).toBeNull();
    expect(extractTakenAtFromExif({ DateTimeOriginal: "1900:01:01 00:00:00" }, utc)).toBe(
      "1900-01-01T00:00:00+00:00",
    );
  });

  it("範囲はオフセットを引いた瞬間で判定する", () => {
    expect(
      extractTakenAtFromExif(
        { DateTimeOriginal: "1900:01:01 08:59:59", OffsetTimeOriginal: "+09:00" },
        JST,
      ),
    ).toBeNull();
  });

  it("端末時刻 + 24時間より未来は null、範囲内は返す", () => {
    const now = new Date("2026-07-02T00:00:00Z");
    const utc = { now, localOffsetMinutes: () => 0 };
    expect(extractTakenAtFromExif({ DateTimeOriginal: "2026:07:04 00:00:00" }, utc)).toBeNull();
    expect(extractTakenAtFromExif({ DateTimeOriginal: "2026:07:02 23:00:00" }, utc)).toBe(
      "2026-07-02T23:00:00+00:00",
    );
  });

  it.each([null, undefined, [], "x", 1, { DateTimeOriginal: 20260702 }])(
    "型が不正なら null: %j",
    (value) => {
      expect(extractTakenAtFromExif(value, JST)).toBeNull();
    },
  );

  it("GPS を含む EXIF でも日時だけを返す", () => {
    const result = extractTakenAtFromExif(
      { DateTimeOriginal: "2026:07:02 09:14:05", GPSLatitude: 35.6, GPSLongitude: 139.7 },
      JST,
    );
    expect(result).toBe("2026-07-02T09:14:05+09:00");
    expect(result).not.toContain("35.6");
    expect(result).not.toContain("139.7");
  });
});

describe("parseExifDateTime", () => {
  it("うるう日を受け付け、平年の2月29日は弾く", () => {
    expect(parseExifDateTime("2024:02:29 00:00:00")).not.toBeNull();
    expect(parseExifDateTime("2025:02:29 00:00:00")).toBeNull();
  });
});

describe("parseExifOffset", () => {
  it("±14:00 まで受け付ける", () => {
    expect(parseExifOffset("+14:00")).toBe(840);
    expect(parseExifOffset("-12:00")).toBe(-720);
    expect(parseExifOffset("+14:01")).toBeNull();
    expect(parseExifOffset(540)).toBeNull();
  });
});

describe("formatTakenAt", () => {
  it("ゼロ埋めし、オフセット 0 は +00:00", () => {
    expect(formatTakenAt({ year: 2026, month: 1, day: 2, hour: 3, minute: 4, second: 5 }, 0)).toBe(
      "2026-01-02T03:04:05+00:00",
    );
  });
});

describe("takenAtFromDate", () => {
  it("端末のオフセット付きで、元の瞬間と一致する", () => {
    const date = new Date(2026, 6, 2, 9, 14, 5);
    const result = takenAtFromDate(date);
    expect(result).toMatch(/^2026-07-02T09:14:05[+-]\d{2}:\d{2}$/);
    expect(new Date(result).getTime()).toBe(date.getTime());
  });
});
