import { isValidCoordinate } from "@/lib/geoCoordinate";
import { isUuid } from "@/lib/uuid";
import type { GeoCoordinates } from "@/services/location/types";

export type PinRouteParams = {
  latitude?: string | string[];
  longitude?: string | string[];
  clientWalkId?: string | string[];
};

function toSingleValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  return null;
}

/**
 * ルートパラメータ（`/pins/new?latitude=...&longitude=...`）を座標に変換する。
 * ディープリンクで任意の値が来うるため `Number()` + `isValidCoordinate` で必ず検証する。
 * 配列・空文字・非数値・範囲外・`Infinity` はすべて null。
 *
 * `features/walk/lib/addPinAction.ts` が組み立てる形（`String(latitude)` / `String(longitude)`、
 * キー名 `latitude`/`longitude`）をそのまま parse できる（feature 間の暗黙の契約）。
 */
export function parsePinLocationParams(params: PinRouteParams): GeoCoordinates | null {
  const rawLatitude = toSingleValue(params.latitude);
  const rawLongitude = toSingleValue(params.longitude);
  if (rawLatitude === null || rawLongitude === null) {
    return null;
  }

  // PR #93 T13: `trim()` 前の空文字判定だけでは空白のみの値（例: `?latitude=%20`）を弾けない。
  // `Number(" ")` は 0 になるため、trim 後に空文字なら無効として扱う。
  const trimmedLatitude = rawLatitude.trim();
  const trimmedLongitude = rawLongitude.trim();
  if (trimmedLatitude === "" || trimmedLongitude === "") {
    return null;
  }

  const latitude = Number(trimmedLatitude);
  const longitude = Number(trimmedLongitude);
  const coordinates: GeoCoordinates = { latitude, longitude };
  if (!isValidCoordinate(coordinates)) {
    return null;
  }
  return coordinates;
}

/** `clientWalkId` パラメータを UUID として検証する。配列・非 UUID は null。 */
export function parseClientWalkIdParam(params: PinRouteParams): string | null {
  const raw = toSingleValue(params.clientWalkId);
  return raw !== null && isUuid(raw) ? raw : null;
}
