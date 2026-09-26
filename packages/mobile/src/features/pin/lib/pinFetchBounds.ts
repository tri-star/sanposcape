import type { ListPinsParams } from "@/api/generated/model";
import type { GeoBounds } from "@/features/pin/types";
import type { MapRegion } from "@/lib/mapRegion";

/** `GET /pins` の1リクエストの件数（backend の上限 200）。 */
export const PIN_MAP_FETCH_LIMIT = 200;
/**
 * 取得範囲は表示範囲の上下左右に、表示範囲の幅・高さのこの割合ぶん余白を足す
 * （小さなパン・ズームのたびに取り直さないため）。
 */
export const PIN_FETCH_PADDING_RATIO = 0.25;
/**
 * 取得結果が上限で打ち切られているとき、表示範囲の高さが取得範囲のこの割合を下回るまで
 * 拡大（ズームイン）したら取り直す。
 */
export const PIN_REFETCH_ZOOM_IN_RATIO = 0.5;
/** queryKey を安定させるための丸め桁（約 11m）。外側へ丸める。 */
const BOUNDS_DECIMALS = 4;

const MIN_LATITUDE = -90;
const MAX_LATITUDE = 90;
const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;

function clampLatitude(value: number): number {
  return Math.min(MAX_LATITUDE, Math.max(MIN_LATITUDE, value));
}

function clampLongitude(value: number): number {
  return Math.min(MAX_LONGITUDE, Math.max(MIN_LONGITUDE, value));
}

/** 中心 ± delta/2 から bbox を求める。緯度は [-90, 90]、経度は [-180, 180] にクランプする。 */
export function regionToBounds(region: MapRegion): GeoBounds {
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  return {
    south: clampLatitude(region.latitude - halfLat),
    north: clampLatitude(region.latitude + halfLat),
    west: clampLongitude(region.longitude - halfLng),
    east: clampLongitude(region.longitude + halfLng),
  };
}

/** 各辺に「幅（または高さ）× ratio」を足してクランプする。 */
export function expandBounds(bounds: GeoBounds, ratio: number): GeoBounds {
  const width = bounds.east - bounds.west;
  const height = bounds.north - bounds.south;
  return {
    south: clampLatitude(bounds.south - height * ratio),
    north: clampLatitude(bounds.north + height * ratio),
    west: clampLongitude(bounds.west - width * ratio),
    east: clampLongitude(bounds.east + width * ratio),
  };
}

function floorToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.floor(value * factor) / factor;
}

function ceilToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.ceil(value * factor) / factor;
}

/**
 * queryKey を安定させるため bbox を丸める。south/west は切り捨て、north/east は切り上げる
 * ことで、丸めた結果が必ず元の bounds を含む（取得範囲が表示範囲より狭くならない）。
 * クランプ後の値をさらに [-90,90]/[-180,180] へクランプし直す（丸めで境界を超えないように）。
 */
export function roundBoundsOutward(
  bounds: GeoBounds,
  decimals: number = BOUNDS_DECIMALS,
): GeoBounds {
  return {
    south: clampLatitude(floorToDecimals(bounds.south, decimals)),
    north: clampLatitude(ceilToDecimals(bounds.north, decimals)),
    west: clampLongitude(floorToDecimals(bounds.west, decimals)),
    east: clampLongitude(ceilToDecimals(bounds.east, decimals)),
  };
}

/** outer が inner を含むか（境界含む）。 */
export function containsBounds(outer: GeoBounds, inner: GeoBounds): boolean {
  return (
    outer.south <= inner.south &&
    outer.west <= inner.west &&
    outer.north >= inner.north &&
    outer.east >= inner.east
  );
}

export type ResolvePinFetchBoundsInput = {
  visibleRegion: MapRegion | null;
  current: GeoBounds | null;
  /** `current`（プレースホルダではない、現在確定している取得範囲）のいずれかの取得が打ち切られているか。 */
  currentTruncated: boolean;
};

/**
 * 「今どの取得範囲（bbox）を使うべきか」を決める純粋関数。
 *
 * `current` と別参照を返すのは「取り直しが必要」なときだけにする（呼び出し側の hook が
 * レンダー中に `setState` するため。同じ参照ならその hook は setState をスキップできる）。
 */
export function resolvePinFetchBounds(input: ResolvePinFetchBoundsInput): GeoBounds | null {
  const { visibleRegion, current, currentTruncated } = input;

  if (visibleRegion === null) {
    return current;
  }

  const visibleBounds = regionToBounds(visibleRegion);

  if (current === null) {
    return roundBoundsOutward(expandBounds(visibleBounds, PIN_FETCH_PADDING_RATIO));
  }

  if (!containsBounds(current, visibleBounds)) {
    return roundBoundsOutward(expandBounds(visibleBounds, PIN_FETCH_PADDING_RATIO));
  }

  if (currentTruncated) {
    const visibleHeight = visibleBounds.north - visibleBounds.south;
    const currentHeight = current.north - current.south;
    if (visibleHeight < currentHeight * PIN_REFETCH_ZOOM_IN_RATIO) {
      return roundBoundsOutward(expandBounds(visibleBounds, PIN_FETCH_PADDING_RATIO));
    }
  }

  return current;
}

/**
 * `GET /pins` のクエリパラメータを組み立てる。4つの bbox は必ずそろえて入れる。
 * `limit` は 1〜200 に正規化する（既定 `PIN_MAP_FETCH_LIMIT`）。
 * `cursor` / `q` / `tags` のキーは作らない（`undefined` のまま。Orval の URL ビルダーは
 * `cursor: null` を渡すとリテラル文字列 `"null"` を送ってしまうため。
 * `@/features/history/lib/walkHistoryParams.ts` の落とし穴と同じ）。
 */
export function buildListPinsParams(input: {
  sanpoMapId: string;
  bounds: GeoBounds;
  limit?: number;
}): ListPinsParams {
  const rawLimit = input.limit ?? PIN_MAP_FETCH_LIMIT;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(PIN_MAP_FETCH_LIMIT, Math.max(1, Math.trunc(rawLimit)))
    : PIN_MAP_FETCH_LIMIT;

  return {
    sanpo_map_id: input.sanpoMapId,
    min_latitude: input.bounds.south,
    min_longitude: input.bounds.west,
    max_latitude: input.bounds.north,
    max_longitude: input.bounds.east,
    limit,
  };
}
