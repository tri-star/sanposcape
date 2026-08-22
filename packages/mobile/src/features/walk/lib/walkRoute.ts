import type { WalkingRouteLeg, WalkingRouteResponse } from "@/api/generated/model";
import type { WalkRoute, WalkRouteBounds, WalkRouteLeg } from "@/features/walk/types";
import {
  DESTINATION_NAME_MAX_LENGTH,
  truncateUnicodeCodePoints,
} from "@/features/walk/lib/unicodeText";
import { isValidCoordinate } from "@/lib/geoCoordinate";
import { toNonNegative } from "@/lib/numberGuard";
import type { GeoCoordinates } from "@/services/location/types";

/**
 * 目的地の表示名が空文字のときのフォールバック表示。
 * `features/history/lib/walkHistoryItem.ts` / `walkDetail.ts` / `features/walk/lib/walkCreateRequest.ts`
 * が同名の値を各ファイルのローカル定数として持つ既存パターンに合わせている
 * （共有モジュールへの切り出しは4箇所目が生まれた時点で検討する。本タスクのスコープ外）。
 */
const FALLBACK_DESTINATION_NAME = "目的地";

/**
 * レスポンス由来の座標を検証済みで取得できなかったことを示すエラー。
 * `origin` / `destination.location` は「往復ルートの起点・終点」という単一の点であり、
 * `path[]` と違って異常値を除外しても代わりが立てられないため、ここに該当したら
 * ルート全体を取得失敗として扱う（`toExploreErrorCode` の default 分岐で "unknown" になり、
 * 既存のルート取得エラー表示・再試行導線がそのまま使える）。
 */
class InvalidWalkRouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWalkRouteError";
  }
}

/**
 * bounds の north_east / south_west のいずれかが不正な場合、既に検証済みの座標群
 * （origin・destination・有効な path 点）から矩形を計算し直して安全側にフォールバックする。
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
 * レスポンスの1 leg を検証して整形する。座標検証後に2点未満になった leg は null を返して捨てる。
 *
 * 注: backend は「2点未満の leg を含む応答」を**周回不成立とみなしてフォールバック（2件）に落とす**契約なので、
 * 実際にはこの null は返らない（**起きない前提の最終防衛**）。それでも残す理由は、
 * `path`（周回全体）が別途検証済みで残るため、ここで捨てても線が完全に消えないから
 * ＝ 防御のコストが「1本の線に degrade する」だけで済むため。
 */
function toWalkRouteLeg(raw: WalkingRouteLeg): WalkRouteLeg | null {
  const path = raw.path
    .map((point) => ({ latitude: point.latitude, longitude: point.longitude }))
    .filter(isValidCoordinate);
  if (path.length < 2) return null;
  return {
    kind: raw.kind,
    durationSeconds: toNonNegative(raw.duration_seconds),
    distanceMeters: toNonNegative(raw.distance_meters),
    path,
  };
}

/**
 * 目的地の表示名を解決する。優先順は:
 *   1. 呼び出し側が明示した名前（選択したカードの名前 / 「出発地点」）
 *   2. レスポンスの destination.name
 *   3. "目的地"（最終フォールバック）
 * backend は place_id も name も無いリクエストに対して空文字を返す契約のため、
 * 2 が空になりうる。空文字のまま持つと地図のピンのラベルが空になるので必ずここで潰す。
 *
 * 「出発地へ帰るルート」の文言（"出発地点"）はここでは分岐させない。`route_type` を見て
 * 日本語を出し分けると backend のフィールドに mobile の文言が結合してしまうため
 * （backend が「表示文言を発明しない」方針を採ったのと同じ理屈をクライアント側でも守る）。
 * 呼び出し側（`useWalkRouteRecalculation` 等）が `fallbackName` として明示的に渡すことで出し分ける。
 *
 * `explicit`（呼び出し側が渡した名前）にも `truncateUnicodeCodePoints` を通す。呼び出し元は
 * 現状すべて固定文字列（`RETURN_TO_START_DESTINATION_NAME`）か、探索APIから取得した時点で
 * 既に `DESTINATION_NAME_MAX_LENGTH` に切り詰め済みの値（`spotCandidate.ts`）しか渡さないため
 * 実害は無いが、将来呼び出し元が増えたときの多層防御として、ここでも上限を再適用しておく
 * （ローカルレビュー C-1）。
 */
function resolveDestinationName(fallbackName: string | undefined, responseName: string): string {
  const explicit = fallbackName?.trim() ?? "";
  if (explicit.length > 0) {
    return truncateUnicodeCodePoints(explicit, DESTINATION_NAME_MAX_LENGTH);
  }
  const fromResponse = responseName.trim();
  return fromResponse.length > 0 ? fromResponse : FALLBACK_DESTINATION_NAME;
}

/**
 * WalkingRouteResponse を画面用 WalkRoute に整形する。表示名はレスポンスではなく引数の name を優先する
 * （`resolveDestinationName` 参照。place_id が画面に出る事故を避けるため）。
 *
 * 座標の妥当性検証（NaN・非有限値・緯度±90度／経度±180度超え）を行う:
 * - `origin`/`destination.location` が不正なら `InvalidWalkRouteError` を throw する（代替が立てられないため）。
 * - `path[]` は不正な点だけを除外する（折れ線の一部が欠けるだけで済むため、ルート全体は失敗にしない）。
 *   除外の結果2点未満になった場合は空配列にする。`RoutePolyline` は元々 `path.length < 2` を
 *   描画スキップの条件にしているため、この扱いは「ルート線なし」として自然に吸収される。
 * - `bounds` が不正なら、検証済みの座標群から矩形を計算し直してフォールバックする。
 * - `legs[]` も同様に座標検証する（`toWalkRouteLeg`）。backend の契約上ここで件数が減ることは
 *   起きない前提だが、防御として除外だけは行う。
 *
 * レスポンスの `route_type` は意図的に `WalkRoute` へ写さない。mobile は「どちらを投げたか」を
 * リクエスト側で既に知っており、表示にも分岐にも使わない（loop/one_way の判別は
 * `hasDistinctLegs()` に一本化する）。Orval の型には現れるが、後任が「使い忘れ」と誤解して
 * 追加しないよう、ここに無視している旨を明記しておく。
 */
export function toWalkRoute(response: WalkingRouteResponse, fallbackName?: string): WalkRoute {
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
      "WalkingRouteResponse の origin/destination.location が不正な座標です",
    );
  }

  const validPath = response.path
    .map((point) => ({ latitude: point.latitude, longitude: point.longitude }))
    .filter(isValidCoordinate);
  const path = validPath.length >= 2 ? validPath : [];

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
      : computeBoundsFromPoints([origin, destinationLocation, ...validPath]);

  return {
    origin,
    destination: {
      // route_type によらず常に任意になった（SS-33）。null は空文字に写像する。
      placeId: response.destination.place_id ?? "",
      name: resolveDestinationName(fallbackName, response.destination.name),
      location: destinationLocation,
    },
    durationSeconds: toNonNegative(response.duration_seconds),
    distanceMeters: toNonNegative(response.distance_meters),
    path,
    legs: (response.legs ?? []).map(toWalkRouteLeg).filter((leg) => leg !== null),
    returnIsSamePath: response.return_is_same_path === true,
    bounds,
  };
}

/**
 * 地図の再フィット要否を判定するためのキー。
 * SS-35 の「起点が変われば別ルート」に加え、SS-33 では **目的地の座標**も含める。
 * 復路の再計算（現在地 → 出発地）は place id を持たず `placeId` が空文字になるため、
 * placeId + origin だけでは「目的地が変わったのに同じキー」になりうるため。
 */
export function walkRouteFitKey(route: WalkRoute | null): string | null {
  if (route === null) return null;
  const { origin, destination } = route;
  return [
    destination.placeId,
    `${origin.latitude},${origin.longitude}`,
    `${destination.location.latitude},${destination.location.longitude}`,
  ].join(":");
}

/** 秒 → 分（四捨五入・負値/NaN は 0）。周回全体・各 leg のどちらにも使う。 */
export function toRouteMinutes(durationSeconds: number): number {
  return Math.round(toNonNegative(durationSeconds) / 60);
}
