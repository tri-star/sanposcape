import { describe, expect, it } from "vitest";

import {
  pinLocationMapKey,
  pinLocationPreviewRegion,
  resolvePinLocationPreviewConfig,
  type PinLocationPreviewVariant,
} from "@/features/pin/lib/pinLocationPreview";

const VARIANTS: PinLocationPreviewVariant[] = ["compact", "interactive"];
const LOCATION = { latitude: 35.6586, longitude: 139.7454 };

describe("resolvePinLocationPreviewConfig", () => {
  it("compact は従来どおり（delta 0.004・操作不可・ボタンなし・横長・region 制御）", () => {
    expect(resolvePinLocationPreviewConfig("compact")).toEqual({
      delta: 0.004,
      panEnabled: false,
      zoomEnabled: false,
      showRecenter: false,
      shape: "wide",
      regionMode: "controlled",
    });
  });

  it("interactive は delta 0.003・パンとズーム有効・ボタンあり・正方形・initialRegion", () => {
    expect(resolvePinLocationPreviewConfig("interactive")).toEqual({
      delta: 0.003,
      panEnabled: true,
      zoomEnabled: true,
      showRecenter: true,
      shape: "square",
      regionMode: "initial",
    });
  });

  it("interactive は compact より拡大して見せる", () => {
    expect(resolvePinLocationPreviewConfig("interactive").delta).toBeLessThan(
      resolvePinLocationPreviewConfig("compact").delta,
    );
  });

  it("操作を許す variant は initialRegion を使う（region のままだと再レンダーでカメラが戻る）", () => {
    const interactiveVariants = VARIANTS.filter((variant) => {
      const config = resolvePinLocationPreviewConfig(variant);
      return config.panEnabled || config.zoomEnabled;
    });
    // 空だと下の検証が素通りするので、対象が存在することを先に固定する
    expect(interactiveVariants.length).toBeGreaterThan(0);
    for (const variant of interactiveVariants) {
      expect(resolvePinLocationPreviewConfig(variant).regionMode).toBe("initial");
    }
  });
});

describe("pinLocationPreviewRegion", () => {
  it("ピンの座標を中心に、variant の delta の範囲を返す", () => {
    for (const variant of VARIANTS) {
      const { delta } = resolvePinLocationPreviewConfig(variant);
      expect(pinLocationPreviewRegion(LOCATION, variant)).toEqual({
        latitude: LOCATION.latitude,
        longitude: LOCATION.longitude,
        latitudeDelta: delta,
        longitudeDelta: delta,
      });
    }
  });
});

describe("pinLocationMapKey", () => {
  it("値が同じなら別オブジェクトでも同じキー", () => {
    expect(pinLocationMapKey({ ...LOCATION })).toBe(pinLocationMapKey({ ...LOCATION }));
  });

  it("緯度だけ・経度だけ違えば別のキー", () => {
    const base = pinLocationMapKey(LOCATION);
    expect(pinLocationMapKey({ ...LOCATION, latitude: LOCATION.latitude + 0.001 })).not.toBe(base);
    expect(pinLocationMapKey({ ...LOCATION, longitude: LOCATION.longitude + 0.001 })).not.toBe(
      base,
    );
  });
});
