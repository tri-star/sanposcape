import type { LoopWalkingRouteResponse, WalkingRouteLeg } from "@/api/generated/model";
import type { WalkRoute, WalkRouteBounds, WalkRouteLeg } from "@/features/walk/types";
import { isValidCoordinate } from "@/lib/geoCoordinate";
import { toNonNegative } from "@/lib/numberGuard";
import type { GeoCoordinates } from "@/services/location/types";

/**
 * レスポンス由来の座標を検証済みで取得できなかったことを示すエラー。
 * `origin` / `destination.location` は「周回ルートの起点（＝終点）」という単一の点であり、
 * `path[]` と違って異常値を除外しても代わりが立てられないため、ここに該当したら
 * ルート全体を取得失敗として扱う（`toExploreErrorCode` の default 分岐で "unknown" になり、
 * 既存のルート取得エラー表示・再試行導線がそのまま使える）。
 * legs の欠損・重複（outbound/return がちょうど1つずつ無い）も同じ扱いにする
 * （代替を作れないため）。
 */
class InvalidWalkRouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWalkRouteError";
  }
}

/**
 * bounds の north_east / south_west のいずれかが不正な場合、既に検証済みの座標群
 * （origin・destination・両 leg の有効な path 点）から矩形を計算し直して安全側にフォールバックする。
 * bounds 自体が壊れていても NaN の Region を作らないための最終手段。
 */
function computeBoundsFromPoints(points: readonly GeoCoordinates[]): WalkRouteBounds {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  return {
    northEast: { latitude: Math.max(...latitudes), longitude: Math.max(...longitudes) },
    southWest: { latitude: Math.min(...latitudes), longitude: Math.min(...longitudes) },
  };
}

/**
 * legs から不正点を除外した WalkRouteLeg を作る。
 * 端点（`path[0]`/`path[末尾]`）は道路吸着点で origin/destination と完全一致しないことがあるが、
 * 補正・継ぎ足しはしない（参考表示なので数 m のずれは許容する。建物の中を通る線になりうるため）。
 */
function toWalkRouteLeg(leg: WalkingRouteLeg): WalkRouteLeg {
  const validPath = leg.path
    .map((point) => ({ latitude: point.latitude, longitude: point.longitude }))
    .filter(isValidCoordinate);
  return {
    kind: leg.kind,
    durationSeconds: toNonNegative(leg.duration_seconds),
    distanceMeters: toNonNegative(leg.distance_meters),
    path: validPath.length >= 2 ? validPath : [],
  };
}

/**
 * legs からちょうど1つの outbound / return を取り出し `[outbound, return]` の順に並べる。
 * 配列の添字には依存しない（レスポンスの順序が入れ替わっても壊れないようにするため）。
 * どちらかが欠けている、または重複している場合は `InvalidWalkRouteError` を throw する。
 */
function pickLegs(legs: readonly WalkingRouteLeg[]): [WalkRouteLeg, WalkRouteLeg] {
  const outboundLegs = legs.filter((leg) => leg.kind === "outbound");
  const returnLegs = legs.filter((leg) => leg.kind === "return");

  if (outboundLegs.length !== 1 || returnLegs.length !== 1) {
    throw new InvalidWalkRouteError(
      `LoopWalkingRouteResponse.legs は outbound/return をちょうど1つずつ含む必要があります（outbound: ${outboundLegs.length}, return: ${returnLegs.length}）`,
    );
  }

  return [toWalkRouteLeg(outboundLegs[0]!), toWalkRouteLeg(returnLegs[0]!)];
}

/**
 * LoopWalkingRouteResponse を画面用 WalkRoute に整形する。表示名はレスポンスではなく引数の name を優先する。
 * backend は destination.name 未指定時に place_id を name として返す仕様のため、
 * 選択したカードの名前（fallbackName）を正とする（place_id が画面に出る事故を避けるため）。
 *
 * 座標の妥当性検証（NaN・非有限値・緯度±90度／経度±180度超え）を行う:
 * - `origin`/`destination.location` が不正なら `InvalidWalkRouteError` を throw する（代替が立てられないため）。
 * - 各 leg の `path[]` は不正な点だけを除外する（折れ線の一部が欠けるだけで済むため、ルート全体は失敗にしない）。
 *   除外の結果2点未満になった場合は空配列にする。`RoutePolyline` は元々 `path.length < 2` を
 *   描画スキップの条件にしているため、この扱いは「その区間の線なし」として自然に吸収される。
 * - `bounds` が不正なら、検証済みの座標群から矩形を計算し直してフォールバックする。
 *
 * 周回全体の `durationSeconds`/`distanceMeters` は **レスポンスの合計値をそのまま使う**
 * （mobile で legs を足し直さない。backend が合計の唯一の正）。
 */
export function toWalkRoute(response: LoopWalkingRouteResponse, fallbackName?: string): WalkRoute {
  const origin: GeoCoordinates = {
    latitude: response.origin.latitude,
    longitude: response.origin.longitude,
  };
  const destinationLocation: GeoCoordinates = {
    latitude: response.destination.location.latitude,
    longitude: response.destination.location.longitude,
  };

  if (!isValidCoordinate(origin) || !isValidCoordinate(destinationLocation)) {
    throw new InvalidWalkRouteError(
      "LoopWalkingRouteResponse の origin/destination.location が不正な座標です",
    );
  }

  const [outbound, returnLeg] = pickLegs(response.legs);

  const northEast: GeoCoordinates = {
    latitude: response.bounds.north_east.latitude,
    longitude: response.bounds.north_east.longitude,
  };
  const southWest: GeoCoordinates = {
    latitude: response.bounds.south_west.latitude,
    longitude: response.bounds.south_west.longitude,
  };
  const bounds =
    isValidCoordinate(northEast) && isValidCoordinate(southWest)
      ? { northEast, southWest }
      : computeBoundsFromPoints([origin, destinationLocation, ...outbound.path, ...returnLeg.path]);

  return {
    origin,
    destination: {
      placeId: response.destination.place_id,
      name: fallbackName ?? response.destination.name,
      location: destinationLocation,
    },
    durationSeconds: toNonNegative(response.duration_seconds),
    distanceMeters: toNonNegative(response.distance_meters),
    legs: [outbound, returnLeg],
    returnIsSamePath: response.return_is_same_path === true,
    bounds,
  };
}

/**
 * 地図の再フィット要否を判定するためのキー。
 * 目的地が同じでも **起点が変われば別ルート** として扱う
 * （散歩開始画面で現在地を取り直すと起点が変わりうるため）。
 * 起点は `buildWalkingRouteRequest` により小数4桁に丸められて送られ、レスポンスの origin も
 * その値が返るため（backend がリクエスト値をエコーする）、同じ地点からの取得では同一キーになる
 * （無駄な再フィットが起きない）。path 端点（道路吸着点）はキーに使わない。
 */
export function walkRouteFitKey(route: WalkRoute | null): string | null {
  if (route === null) return null;
  return `${route.destination.placeId}:${route.origin.latitude},${route.origin.longitude}`;
}

/** 秒 → 分（四捨五入）。周回全体・区間どちらにも使う。負値・NaN は0に丸める。 */
export function toRouteMinutes(durationSeconds: number): number {
  return Math.round(toNonNegative(durationSeconds) / 60);
}
