import { describe, expect, it } from "vitest";

import {
  PIN_CLUSTER_MAX_ZOOM,
  clusterExpansionRegion,
  createPinClusterIndex,
  regionToClusterZoom,
  resolvePinMapItems,
  type PinMapItem,
} from "@/features/pin/lib/pinClusters";
import type { RegisteredPin } from "@/features/pin/types";
import type { MapRegion } from "@/lib/mapRegion";

const MAP_WIDTH_DP = 400;

function pin(id: string, latitude: number, longitude: number): RegisteredPin {
  return {
    id,
    sanpoMapId: "map-1",
    name: null,
    location: { latitude, longitude },
    archived: false,
    sanpoMapIcon: "pin",
  };
}

/** 東京駅のまわりに 0.0005 度（約 50m）間隔で並べた n×n のピン。 */
function gridPins(n: number): RegisteredPin[] {
  const pins: RegisteredPin[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      pins.push(pin(`p-${i}-${j}`, 35.68 + i * 0.0005, 139.76 + j * 0.0005));
    }
  }
  return pins;
}

function regionAt(latitude: number, longitude: number, delta: number): MapRegion {
  return { latitude, longitude, latitudeDelta: delta, longitudeDelta: delta };
}

function countPins(items: PinMapItem[]): number {
  return items.reduce((sum, item) => sum + (item.kind === "cluster" ? item.count : 1), 0);
}

describe("regionToClusterZoom", () => {
  it("経度の幅が半分になるとズームが1上がる", () => {
    const wide = regionToClusterZoom(regionAt(35.68, 139.76, 0.2), MAP_WIDTH_DP);
    const narrow = regionToClusterZoom(regionAt(35.68, 139.76, 0.1), MAP_WIDTH_DP);
    expect(narrow - wide).toBeCloseTo(1);
  });

  it("幅が 0 以下・地図の幅が 0 なら 0（log の発散を防ぐ）", () => {
    expect(regionToClusterZoom(regionAt(35.68, 139.76, 0), MAP_WIDTH_DP)).toBe(0);
    expect(regionToClusterZoom(regionAt(35.68, 139.76, 0.1), 0)).toBe(0);
  });
});

describe("resolvePinMapItems", () => {
  /**
   * 前提: 約 450m 四方に 100 件のピン。操作: 約 10km 四方を表示する。
   * 期待: 1つのクラスタにまとまり、件数が全件と一致する（縮小しても全体の位置が分かる。SS-243）。
   */
  it("縮小すると全件が少数のクラスタにまとまり、件数の合計は全件と一致する", () => {
    const pins = gridPins(10);
    const items = resolvePinMapItems(
      createPinClusterIndex(pins),
      regionAt(35.682, 139.762, 0.1),
      MAP_WIDTH_DP,
    );
    expect(items.length).toBeLessThan(5);
    expect(items.every((item) => item.kind === "cluster")).toBe(true);
    expect(countPins(items)).toBe(100);
  });

  /**
   * 前提: 約 50m 間隔のピン。操作: まとめない縮尺（最大ズーム）まで拡大する。
   * 期待: すべて単独のピンとして返り、元の RegisteredPin がそのまま入る（タップで詳細へ進める。D1'）。
   */
  it("まとめない縮尺まで拡大すると、すべて単独のピンになる", () => {
    const pins = gridPins(3);
    const delta = (360 * MAP_WIDTH_DP) / (256 * 2 ** PIN_CLUSTER_MAX_ZOOM);
    const items = resolvePinMapItems(
      createPinClusterIndex(pins),
      regionAt(35.6805, 139.7605, delta),
      MAP_WIDTH_DP,
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.kind === "pin")).toBe(true);
    for (const item of items) {
      if (item.kind === "pin") expect(pins).toContain(item.pin);
    }
  });

  /** 前提: 範囲の外（大阪）のピン。期待: 東京を表示しているときは返らない（描く数を抑える）。 */
  it("表示範囲（上下左右に 25% 広げた範囲）の外のピンは返さない", () => {
    const pins = [pin("tokyo", 35.68, 139.76), pin("osaka", 34.69, 135.5)];
    const items = resolvePinMapItems(
      createPinClusterIndex(pins),
      regionAt(35.68, 139.76, 0.01),
      MAP_WIDTH_DP,
    );
    expect(items).toEqual([{ kind: "pin", pin: pins[0] }]);
  });

  it("ピンが 0 件なら空", () => {
    expect(
      resolvePinMapItems(createPinClusterIndex([]), regionAt(35.68, 139.76, 0.1), MAP_WIDTH_DP),
    ).toEqual([]);
  });
});

describe("clusterExpansionRegion", () => {
  /**
   * 前提: 縮小して1つにまとまったクラスタ。操作: タップする。
   * 期待: クラスタの位置を中心に、今より狭い範囲（縦横比は同じ）へ移る。移った先でクラスタが分かれる。
   */
  it("クラスタの位置を中心に、分かれるズームまで拡大し、縦横比を保つ", () => {
    const pins = gridPins(10);
    const index = createPinClusterIndex(pins);
    const current: MapRegion = {
      latitude: 35.682,
      longitude: 139.762,
      latitudeDelta: 0.2,
      longitudeDelta: 0.1,
    };
    const [first] = resolvePinMapItems(index, current, MAP_WIDTH_DP);
    if (first?.kind !== "cluster") throw new Error("expected a cluster");

    const next = clusterExpansionRegion(index, first, current, MAP_WIDTH_DP);
    expect(next.latitude).toBe(first.coordinate.latitude);
    expect(next.longitude).toBe(first.coordinate.longitude);
    expect(next.longitudeDelta).toBeLessThan(current.longitudeDelta);
    expect(next.latitudeDelta / next.longitudeDelta).toBeCloseTo(2);
    expect(resolvePinMapItems(index, next, MAP_WIDTH_DP).length).toBeGreaterThan(1);
  });

  /**
   * 前提: 同じ座標の2件（最大ズームでも分かれない）。期待: 最大ズームより先へは拡大しない。
   * 前提: 今がそれより拡大している場合も、今の範囲の半分までは拡大する（押しても何も起きない、を避ける）。
   */
  it("同じ座標のピンのクラスタは最大ズームで止め、今より縮小はしない", () => {
    const pins = [pin("a", 35.68, 139.76), pin("b", 35.68, 139.76)];
    const index = createPinClusterIndex(pins);
    const current = regionAt(35.68, 139.76, 0.1);
    const [first] = resolvePinMapItems(index, current, MAP_WIDTH_DP);
    if (first?.kind !== "cluster") throw new Error("expected a cluster");

    const next = clusterExpansionRegion(index, first, current, MAP_WIDTH_DP);
    const maxZoomDelta = (360 * MAP_WIDTH_DP) / (256 * 2 ** PIN_CLUSTER_MAX_ZOOM);
    expect(next.longitudeDelta).toBeCloseTo(maxZoomDelta);

    const closer = regionAt(35.68, 139.76, maxZoomDelta);
    const again = clusterExpansionRegion(index, first, closer, MAP_WIDTH_DP);
    expect(again.longitudeDelta).toBeCloseTo(maxZoomDelta / 2);
  });

  /** 前提: index を作り直した後の古い clusterId。期待: 例外を出さず、今より拡大した範囲を返す。 */
  it("index に無い clusterId でも例外を出さずに拡大する", () => {
    const index = createPinClusterIndex(gridPins(2));
    const current = regionAt(35.68, 139.76, 0.1);
    const next = clusterExpansionRegion(
      index,
      {
        kind: "cluster",
        clusterId: 999_999,
        count: 2,
        coordinate: { latitude: 35.68, longitude: 139.76 },
      },
      current,
      MAP_WIDTH_DP,
    );
    expect(next.longitudeDelta).toBeLessThan(current.longitudeDelta);
    expect(next.latitude).toBe(35.68);
  });
});
