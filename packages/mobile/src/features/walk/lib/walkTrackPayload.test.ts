import { describe, expect, it } from "vitest";

import { toTrackPayload } from "@/features/walk/lib/walkTrackPayload";
import type { GeoCoordinates } from "@/services/location/types";

describe("toTrackPayload", () => {
  it("空配列は空配列になる", () => {
    expect(toTrackPayload([])).toEqual([]);
  });

  it("上限以下はそのまま（丸めだけ適用）", () => {
    const points: GeoCoordinates[] = [
      { latitude: 35.681236, longitude: 139.767125 },
      { latitude: 35.6875, longitude: 139.7625 },
    ];
    expect(toTrackPayload(points)).toEqual([
      { latitude: 35.681236, longitude: 139.767125 },
      { latitude: 35.6875, longitude: 139.7625 },
    ]);
  });

  it("小数6桁に丸まる", () => {
    const points: GeoCoordinates[] = [{ latitude: 35.6812361234, longitude: 139.7671255678 }];
    expect(toTrackPayload(points)).toEqual([{ latitude: 35.681236, longitude: 139.767126 }]);
  });

  it("丸め後の連続重複が落ちる", () => {
    const points: GeoCoordinates[] = [
      { latitude: 35.6812361, longitude: 139.7671251 },
      { latitude: 35.6812362, longitude: 139.7671252 }, // 丸め後に同一座標
      { latitude: 35.6875, longitude: 139.7625 },
    ];
    expect(toTrackPayload(points)).toEqual([
      { latitude: 35.681236, longitude: 139.767125 },
      { latitude: 35.6875, longitude: 139.7625 },
    ]);
  });

  it("重複除外は連続にのみ適用される（離れて同じ座標が再度現れたら残す）", () => {
    const points: GeoCoordinates[] = [
      { latitude: 35.0, longitude: 139.0 },
      { latitude: 36.0, longitude: 140.0 },
      { latitude: 35.0, longitude: 139.0 },
    ];
    expect(toTrackPayload(points)).toHaveLength(3);
  });

  it("上限超過で長さがちょうど maxPoints になり、先頭と末尾が保持される", () => {
    const points: GeoCoordinates[] = Array.from({ length: 20 }, (_, i) => ({
      latitude: i,
      longitude: i,
    }));

    const result = toTrackPayload(points, 5);

    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ latitude: 0, longitude: 0 });
    expect(result[result.length - 1]).toEqual({ latitude: 19, longitude: 19 });
  });

  it("NaN / 緯度91 / 経度181の点は除外される", () => {
    const points: GeoCoordinates[] = [
      { latitude: Number.NaN, longitude: 139.0 },
      { latitude: 91, longitude: 139.0 },
      { latitude: 35.0, longitude: 181 },
      { latitude: 35.0, longitude: 139.0 },
    ];
    expect(toTrackPayload(points)).toEqual([{ latitude: 35.0, longitude: 139.0 }]);
  });
});
