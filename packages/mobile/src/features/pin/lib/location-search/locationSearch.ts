import type {
  PlaceTextSearchRequest,
  PlaceTextSearchResponse,
  PlaceTextSearchScope,
} from "@/api/generated/model";
import { regionToBounds, roundBoundsOutward } from "@/features/pin/lib/pinFetchBounds";
import { regionAroundPoint } from "@/features/pin/lib/pinLocationPicker";
import { isValidCoordinate } from "@/lib/geoCoordinate";
import type { MapRegion } from "@/lib/mapRegion";
import type { GeoCoordinates } from "@/services/location/types";

/**
 * ピンタブの検索（SS-267。ADR-M-026）。住所・駅・施設の種類（「コンビニ」など）を `POST /explore/places/text-search` で探し、
 * 結果を地図に「検索結果のピン」として打つ。結果は Google Places の内容なので、端末にも保存しない（メモリだけ）。
 *
 * 名前は `locationSearch`（walk の探索の `placeSearch*` と区別する）。
 */

/** 検索語の上限（code point。前後の空白を除いた後）。backend の `PLACE_TEXT_QUERY_MAX_LENGTH` と同じ。 */
export const LOCATION_SEARCH_QUERY_MAX_LENGTH = 100;

export type LocationSearchResult = {
  id: string;
  name: string;
  /** 住所（国名・郵便番号を落としたもの）。無いときは null。 */
  address: string | null;
  location: GeoCoordinates;
};

export type LocationSearchScope = PlaceTextSearchScope;

/** 前後の空白を除き、上限で切る。空なら null（送らない）。 */
export function normalizeLocationSearchQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return Array.from(trimmed).slice(0, LOCATION_SEARCH_QUERY_MAX_LENGTH).join("").trim();
}

/**
 * 送信ボディ。範囲は今の地図の表示範囲を、ピンの取得（`GET /pins`）と同じく外側へ小数4桁に丸める
 * （表示範囲より精度の高い位置を送らない）。日付変更線をまたぐ範囲は、backend が受けないので送らない。
 */
export function buildLocationSearchRequest(
  rawQuery: string,
  visibleRegion: MapRegion,
): PlaceTextSearchRequest | null {
  const query = normalizeLocationSearchQuery(rawQuery);
  if (query === null) return null;
  const bounds = roundBoundsOutward(regionToBounds(visibleRegion));
  if (bounds.south > bounds.north || bounds.west > bounds.east) return null;
  return {
    query,
    bounds: {
      south_west: { latitude: bounds.south, longitude: bounds.west },
      north_east: { latitude: bounds.north, longitude: bounds.east },
    },
  };
}

/** 応答を表示用に変える。座標が不正・名前が空の結果は落とす（地図に渡す前の防波堤）。並びは変えない。 */
export function toLocationSearchResults(response: PlaceTextSearchResponse): LocationSearchResult[] {
  const results: LocationSearchResult[] = [];
  for (const result of response.results) {
    const name = result.name.trim();
    if (name.length === 0 || !isValidCoordinate(result.location)) continue;
    const address = result.address?.trim() ?? "";
    results.push({
      id: result.id,
      name,
      address: address.length > 0 ? address : null,
      location: { latitude: result.location.latitude, longitude: result.location.longitude },
    });
  }
  return results;
}

/**
 * 検索の後に地図を動かす先。表示範囲の外まで広げて探した（`expanded`）ときだけ、最初の結果（Google の関連度の順で先頭）の付近へ動かす。
 * 表示範囲の中で見つかったときは、利用者が見ている範囲を変えない（null）。
 */
export function locationSearchFocusRegion(
  results: readonly LocationSearchResult[],
  scope: LocationSearchScope,
): MapRegion | null {
  if (scope !== "expanded") return null;
  const first = results[0];
  return first ? regionAroundPoint(first.location) : null;
}
