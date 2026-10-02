import { describe, expect, it } from "vitest";

import {
  PHOTO_ZOOM_IDENTITY,
  applyPanChange,
  applyPinchChange,
  clampPhotoZoomScale,
  clampPhotoZoomTranslate,
  reclampPhotoZoomForFrame,
  resolvePhotoZoomLayout,
  containSize,
  type PhotoZoomLayout,
} from "@/features/pin/lib/photoZoom";

const fullLayout: PhotoZoomLayout = {
  frame: { width: 400, height: 800 },
  content: { width: 400, height: 800 },
};
const zeroLayout: PhotoZoomLayout = {
  frame: { width: 0, height: 0 },
  content: { width: 0, height: 0 },
};
const letterboxLayout: PhotoZoomLayout = {
  frame: { width: 400, height: 800 },
  content: { width: 400, height: 300 },
};

describe("containSize", () => {
  it("横長の写真を枠の幅に合わせる", () => {
    expect(containSize({ width: 4000, height: 3000 }, { width: 400, height: 800 })).toEqual({
      width: 400,
      height: 300,
    });
  });

  it("縦長の写真を枠の高さに合わせる", () => {
    expect(containSize({ width: 3000, height: 4000 }, { width: 800, height: 400 })).toEqual({
      width: 300,
      height: 400,
    });
  });

  it("枠と同じ比率なら枠と同じ大きさ", () => {
    expect(containSize({ width: 1000, height: 2000 }, { width: 400, height: 800 })).toEqual({
      width: 400,
      height: 800,
    });
  });

  it("写真の寸法が不正なら枠いっぱいとみなす", () => {
    const frame = { width: 400, height: 800 };
    expect(containSize({ width: 0, height: 100 }, frame)).toEqual(frame);
    expect(containSize({ width: Number.NaN, height: 100 }, frame)).toEqual(frame);
  });

  it("枠が 0x0 なら 0x0", () => {
    expect(containSize({ width: 100, height: 100 }, { width: 0, height: 0 })).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe("clampPhotoZoomScale", () => {
  it.each([
    [0.5, 1],
    [1, 1],
    [2.5, 2.5],
    [10, 4],
    [Number.NaN, 1],
  ])("%s -> %s", (input, expected) => {
    expect(clampPhotoZoomScale(input)).toBe(expected);
  });
});

describe("clampPhotoZoomTranslate", () => {
  it("倍率1では移動量を0に戻す", () => {
    expect(
      clampPhotoZoomTranslate({ scale: 1, translateX: 50, translateY: 50 }, fullLayout),
    ).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });

  it("はみ出す方向だけ動かせる（右端で止まる）", () => {
    expect(
      clampPhotoZoomTranslate({ scale: 2, translateX: 300, translateY: 100 }, letterboxLayout),
    ).toEqual({ scale: 2, translateX: 200, translateY: 0 });
  });

  it("左端で止まる", () => {
    expect(
      clampPhotoZoomTranslate({ scale: 2, translateX: -300, translateY: 0 }, letterboxLayout),
    ).toEqual({ scale: 2, translateX: -200, translateY: 0 });
  });

  it("範囲内ならそのまま", () => {
    expect(
      clampPhotoZoomTranslate({ scale: 2, translateX: 100, translateY: 0 }, letterboxLayout),
    ).toEqual({ scale: 2, translateX: 100, translateY: 0 });
  });

  it("結果が -0 にならない", () => {
    const result = clampPhotoZoomTranslate(
      { scale: 1, translateX: -10, translateY: -10 },
      fullLayout,
    );
    expect(Object.is(result.translateX, 0)).toBe(true);
    expect(Object.is(result.translateY, 0)).toBe(true);
  });
});

describe("applyPinchChange", () => {
  it("中心を焦点に2倍にすると移動量は0", () => {
    const result = applyPinchChange(
      PHOTO_ZOOM_IDENTITY,
      { scaleChange: 2, focalX: 200, focalY: 400 },
      fullLayout,
    );
    expect(result.scale).toBe(2);
    expect(result.translateX).toBeCloseTo(0);
    expect(result.translateY).toBeCloseTo(0);
  });

  it("中心から +100 の焦点で2倍にすると、焦点の下の点が動かない", () => {
    const result = applyPinchChange(
      PHOTO_ZOOM_IDENTITY,
      { scaleChange: 2, focalX: 300, focalY: 400 },
      fullLayout,
    );
    expect(result.scale).toBe(2);
    expect(result.translateX).toBeCloseTo(-100);
    expect(result.translateY).toBeCloseTo(0);
    const before = (100 - 0) / 1;
    const after = (100 - result.translateX) / result.scale;
    expect(after).toBeCloseTo(before);
  });

  it("レターボックスで焦点が写真の外（黒い余白）でも、範囲内に収めて焦点を基準に拡大する", () => {
    // 枠 400x800・写真 400x300。焦点は中心から縦に +300（写真の外）。
    const result = applyPinchChange(
      PHOTO_ZOOM_IDENTITY,
      { scaleChange: 2, focalX: 200, focalY: 700 },
      letterboxLayout,
    );
    expect(result.scale).toBe(2);
    expect(result.translateX).toBeCloseTo(0);
    // 縦は 2*300=600 < 800 で動かせないので 0 に収まる。
    expect(result.translateY).toBe(0);
  });

  it("レターボックスで焦点が中心外の横方向は焦点の下の点を保つ", () => {
    const result = applyPinchChange(
      PHOTO_ZOOM_IDENTITY,
      { scaleChange: 2, focalX: 300, focalY: 400 },
      letterboxLayout,
    );
    expect(result.translateX).toBeCloseTo(-100);
    expect(result.translateY).toBe(0);
  });

  it("枠が 0x0 でも壊れず 0 に収まる", () => {
    const result = applyPinchChange(
      PHOTO_ZOOM_IDENTITY,
      { scaleChange: 2, focalX: 10, focalY: 10 },
      zeroLayout,
    );
    expect(result.scale).toBe(2);
    expect(result.translateX).toBe(0);
    expect(result.translateY).toBe(0);
  });

  it("上限を超える拡大は4倍で止まり、実際の倍率比 k=4/3 で移動量を計算する", () => {
    const state = { scale: 3, translateX: 0, translateY: 0 };
    const result = applyPinchChange(
      state,
      { scaleChange: 2, focalX: 300, focalY: 400 },
      fullLayout,
    );
    expect(result.scale).toBe(4);
    // tx = fx - k * (fx - 0) = 100 - (4/3) * 100
    expect(result.translateX).toBeCloseTo(100 - (4 / 3) * 100);
  });

  it("下限を割ると1倍・中央に戻る", () => {
    const result = applyPinchChange(
      { scale: 2, translateX: 100, translateY: 0 },
      { scaleChange: 0.25, focalX: 200, focalY: 400 },
      fullLayout,
    );
    expect(result.scale).toBe(1);
    expect(result.translateX).toBe(0);
    expect(result.translateY).toBe(0);
  });

  it.each([0, -1, Number.NaN])("scaleChange が %s なら状態を変えない", (scaleChange) => {
    const state = { scale: 2, translateX: 10, translateY: 5 };
    expect(applyPinchChange(state, { scaleChange, focalX: 0, focalY: 0 }, fullLayout)).toEqual(
      state,
    );
  });

  it("入力の state を書き換えない", () => {
    const state = { scale: 1, translateX: 0, translateY: 0 };
    applyPinchChange(state, { scaleChange: 2, focalX: 300, focalY: 100 }, fullLayout);
    expect(state).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });
});

describe("applyPanChange", () => {
  it("倍率1では動かない", () => {
    expect(applyPanChange(PHOTO_ZOOM_IDENTITY, { changeX: 50, changeY: 50 }, fullLayout)).toEqual(
      PHOTO_ZOOM_IDENTITY,
    );
  });

  it("拡大中は差分を積む", () => {
    expect(
      applyPanChange(
        { scale: 2, translateX: 0, translateY: 0 },
        { changeX: 50, changeY: -30 },
        fullLayout,
      ),
    ).toEqual({ scale: 2, translateX: 50, translateY: -30 });
  });

  it("範囲を超える移動は端で止まる", () => {
    expect(
      applyPanChange(
        { scale: 2, translateX: 0, translateY: 0 },
        { changeX: 500, changeY: 0 },
        fullLayout,
      ),
    ).toEqual({ scale: 2, translateX: 200, translateY: 0 });
  });

  it("枠が 0x0 なら動かない", () => {
    expect(
      applyPanChange(
        { scale: 2, translateX: 0, translateY: 0 },
        { changeX: 50, changeY: 50 },
        zeroLayout,
      ),
    ).toEqual({ scale: 2, translateX: 0, translateY: 0 });
  });

  it("changeX が NaN なら X は動かず Y だけ反映する", () => {
    expect(
      applyPanChange(
        { scale: 2, translateX: 10, translateY: 0 },
        { changeX: Number.NaN, changeY: 20 },
        fullLayout,
      ),
    ).toEqual({ scale: 2, translateX: 10, translateY: 20 });
  });
});

describe("resolvePhotoZoomLayout / reclampPhotoZoomForFrame", () => {
  it("枠と写真の実寸から contain のレイアウトを作る", () => {
    expect(
      resolvePhotoZoomLayout({ width: 4000, height: 3000 }, { width: 400, height: 800 }),
    ).toEqual(letterboxLayout);
  });

  it("枠が広がって範囲が小さくなったら移動量を収め直す", () => {
    // 枠 400x800・写真 4:3 → content 400x300。2倍で translateX 最大 200。
    // 枠が 700 幅になると content 700x525、2倍の最大は 350 なので範囲は広がり値は保たれる。
    const photo = { width: 4000, height: 3000 };
    const state = { scale: 2, translateX: 200, translateY: 0 };
    expect(reclampPhotoZoomForFrame(state, photo, { width: 700, height: 800 })).toEqual(state);
    // 枠が縮むと（300 幅）content 300x225、2倍の最大は 150 に縮み、値が収まる。
    expect(reclampPhotoZoomForFrame(state, photo, { width: 300, height: 800 })).toEqual({
      scale: 2,
      translateX: 150,
      translateY: 0,
    });
  });

  it("枠が 0x0 なら移動量は 0", () => {
    expect(
      reclampPhotoZoomForFrame(
        { scale: 2, translateX: 50, translateY: 50 },
        { width: 100, height: 100 },
        { width: 0, height: 0 },
      ),
    ).toEqual({ scale: 2, translateX: 0, translateY: 0 });
  });
});
