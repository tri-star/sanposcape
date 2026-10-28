import Supercluster from "supercluster";

import type { RegisteredPin } from "@/features/pin/types";
import type { MapRegion } from "@/lib/mapRegion";
import type { GeoCoordinates } from "@/services/location/types";

/**
 * 地図のタイル1枚の幅（dp）。Google Maps・Apple Maps とも、ズーム z で世界の幅は `256 × 2^z`（dp）。
 * `extent` をこれに揃え、`radius` を画面上の dp で書けるようにする。
 */
const TILE_SIZE_DP = 256;
/** まとめる半径（dp）。ピンの絵（38px）の幅に少し足した距離。 */
export const PIN_CLUSTER_RADIUS_DP = 40;
/**
 * このズーム以上（幅 400dp 前後の画面で地図の幅が約 1.6km より狭い）ではまとめない。ピンタブを開いたときの縮尺
 * （経度の幅 0.008 度。ズーム約 16）は余裕をもってこの中に入り、近所を見ている縮尺では1つずつのピンを見せる
 * （描く数は表示範囲の分だけ）。16 にすると、画面の幅によっては開いたときの縮尺が境目にかかる。
 * 同じ座標のピンはここを超えても分かれない（重なったまま描く）。
 */
export const PIN_CLUSTER_MAX_ZOOM = 15;
/**
 * index を作る最大のズーム。まとめない縮尺でも密な地区では今のズームでまとめ直すので、地図の最大の拡大まで作っておく
 * （千件程度なら作る時間は無視できる）。これより拡大すると supercluster は元の点を返す。
 */
const INDEX_MAX_ZOOM = 20;
/**
 * まとめない縮尺でも、1つずつ描くピンがこれを超えるならまとめる（密な地区で、まとめないズームに入った途端に数百の Marker を描かないように。
 * 200 は SS-243 より前の1リクエストの上限で、その数までは描けていた）。
 */
export const PIN_MAP_MAX_SINGLE_PINS = 200;
/** まとめる範囲は表示範囲の上下左右にこの割合ぶん広げる（端のクラスタがパンで急に現れ・消えないように）。 */
const CLUSTER_BOUNDS_PADDING_RATIO = 0.25;

type PinPointProps = { pinIndex: number };

/** 地図に描く1つの要素。単独のピンか、まとまり（件数と代表の位置）。 */
export type PinMapItem =
  | { kind: "pin"; pin: RegisteredPin }
  | { kind: "cluster"; clusterId: number; count: number; coordinate: GeoCoordinates };

/** `createPinClusterIndex` の結果。ピンの配列が変わったときだけ作り直す（呼び出し側で memo する）。 */
export type PinClusterIndex = {
  pins: readonly RegisteredPin[];
  index: Supercluster<PinPointProps>;
};

/**
 * 登録済みピンからまとめの index を作る（SS-243。ADR-M-012 D3 の SS-243 追補）。
 * 地図をまたいで1つにまとめる（複数の地図のピンが近くにあれば同じクラスタに入る）。
 */
export function createPinClusterIndex(pins: readonly RegisteredPin[]): PinClusterIndex {
  const index = new Supercluster<PinPointProps>({
    radius: PIN_CLUSTER_RADIUS_DP,
    extent: TILE_SIZE_DP,
    maxZoom: INDEX_MAX_ZOOM,
  });
  index.load(
    pins.map((pin, pinIndex) => ({
      type: "Feature" as const,
      properties: { pinIndex },
      geometry: {
        type: "Point" as const,
        coordinates: [pin.location.longitude, pin.location.latitude],
      },
    })),
  );
  return { pins, index };
}

/**
 * 表示範囲と地図の幅（dp）からズームを求める（`longitudeDelta = 360 × 幅 / (256 × 2^z)` を z について解く）。
 * 小数のまま返す（supercluster は内部で切り捨てる）。
 */
export function regionToClusterZoom(region: MapRegion, mapWidthDp: number): number {
  if (!(region.longitudeDelta > 0) || !(mapWidthDp > 0)) return 0;
  return Math.max(0, Math.log2((360 * mapWidthDp) / (TILE_SIZE_DP * region.longitudeDelta)));
}

function clampLatitude(value: number): number {
  return Math.min(90, Math.max(-90, value));
}

function clampLongitude(value: number): number {
  return Math.min(180, Math.max(-180, value));
}

/**
 * 表示範囲に描く要素（単独のピンとクラスタ）を求める。範囲は上下左右に 25% 広げる。
 * まとめない縮尺で1つずつのピンが `PIN_MAP_MAX_SINGLE_PINS` を超えるときは、今のズームでまとめる（円の間隔は画面上で同じ）。
 * 日付変更線をまたぐ範囲は対象外（日本国内前提。`regionForCoordinates` と同じ）。
 */
export function resolvePinMapItems(
  cluster: PinClusterIndex,
  region: MapRegion,
  mapWidthDp: number,
): PinMapItem[] {
  if (cluster.pins.length === 0) return [];
  const halfLat = (region.latitudeDelta / 2) * (1 + 2 * CLUSTER_BOUNDS_PADDING_RATIO);
  const halfLng = (region.longitudeDelta / 2) * (1 + 2 * CLUSTER_BOUNDS_PADDING_RATIO);
  const bbox: [number, number, number, number] = [
    clampLongitude(region.longitude - halfLng),
    clampLatitude(region.latitude - halfLat),
    clampLongitude(region.longitude + halfLng),
    clampLatitude(region.latitude + halfLat),
  ];
  const zoom = regionToClusterZoom(region, mapWidthDp);
  let features: ReturnType<typeof cluster.index.getClusters>;
  if (zoom < PIN_CLUSTER_MAX_ZOOM) {
    features = cluster.index.getClusters(bbox, zoom);
  } else {
    features = cluster.index.getClusters(bbox, INDEX_MAX_ZOOM + 1);
    if (features.length > PIN_MAP_MAX_SINGLE_PINS) {
      features = cluster.index.getClusters(bbox, zoom);
    }
  }

  const items: PinMapItem[] = [];
  for (const feature of features) {
    const [longitude, latitude] = feature.geometry.coordinates;
    const props = feature.properties;
    if ("cluster" in props && props.cluster === true) {
      items.push({
        kind: "cluster",
        clusterId: props.cluster_id,
        count: props.point_count,
        coordinate: { latitude, longitude },
      });
      continue;
    }
    const pin = cluster.pins[(props as PinPointProps).pinIndex];
    if (pin !== undefined) items.push({ kind: "pin", pin });
  }
  return items;
}

/**
 * クラスタをタップしたときに移る表示範囲。そのクラスタが分かれるズーム（今がまとめる縮尺なら、まとめない縮尺を上限）まで、
 * クラスタの位置を中心に拡大する。縦横の比は今の表示範囲のまま（地図の高さを知らなくてよいように）。
 * 少なくとも今の範囲の半分までは拡大する（まとめない縮尺で密なためにまとめた円や、同じ座標のピンの円を押しても何も起きない、を避ける）。
 */
export function clusterExpansionRegion(
  cluster: PinClusterIndex,
  item: Extract<PinMapItem, { kind: "cluster" }>,
  current: MapRegion,
  mapWidthDp: number,
): MapRegion {
  const currentZoom = regionToClusterZoom(current, mapWidthDp);
  // まとめる縮尺から押したら、まとめない縮尺で止める（そこで1つずつ出る。密ならそこでまた円になる）。
  const zoomCap = currentZoom < PIN_CLUSTER_MAX_ZOOM ? PIN_CLUSTER_MAX_ZOOM : INDEX_MAX_ZOOM + 1;
  let zoom: number;
  try {
    zoom = Math.min(cluster.index.getClusterExpansionZoom(item.clusterId), zoomCap);
  } catch {
    // index を作り直した直後に古い clusterId で押された場合（getClusterExpansionZoom は内部で getChildren を呼び、
    // 無い id では throw しうる）。
    zoom = currentZoom + 1;
  }
  const expandedLongitudeDelta = (360 * mapWidthDp) / (TILE_SIZE_DP * 2 ** zoom);
  const longitudeDelta = Math.min(expandedLongitudeDelta, current.longitudeDelta / 2);
  const scale = longitudeDelta / current.longitudeDelta;
  return {
    latitude: item.coordinate.latitude,
    longitude: item.coordinate.longitude,
    latitudeDelta: current.latitudeDelta * scale,
    longitudeDelta,
  };
}

/** クラスタの読み上げ（地図上の円に `title` を付けないので、何の円かを読み上げで伝える）。 */
export function pinClusterAccessibilityLabel(count: number): string {
  return `${count}件のピンのまとまり。タップで拡大`;
}
