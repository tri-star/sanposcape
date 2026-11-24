import { resolveSpotDisplayName } from "@/features/walk/explore/lib/spotCandidate";
import type { WalkDestination } from "@/features/walk/shared/types";
import { isValidCoordinate } from "@/lib/geoCoordinate";
import { isUuid } from "@/lib/uuid";
import type { GeoCoordinates } from "@/services/location/types";

/**
 * ピンを目的地にしたときの `WalkDestination.placeId` の接頭辞（SS-170。ADR-M-027）。
 *
 * API の `place_id` は 1〜256 文字の任意の文字列で、backend は Google への問い合わせに使わない
 * （経路は座標から作り、`place_id` は応答へのエコーと散歩の記録 `walks.destination_place_id` にだけ使う）。
 * Google の place id と区別でき、散歩の記録からピンを辿れるよう `pin:<pinId>` にする。
 */
export const PIN_DESTINATION_PLACE_ID_PREFIX = "pin:";

/** `/walk-start` のルートパラメータ（ピンを目的地にして開く）。 */
export type PinWalkStartParams = {
  pinId: string;
  latitude: string;
  longitude: string;
  name: string;
};

export type PinWalkStartRouteParams = {
  [K in keyof PinWalkStartParams]?: string | string[];
};

/** ピン詳細の「このピンまで散歩する」から `/walk-start` に渡すパラメータを作る。 */
export function buildPinWalkStartParams(pin: {
  id: string;
  name: string;
  location: GeoCoordinates;
}): PinWalkStartParams {
  return {
    pinId: pin.id,
    latitude: String(pin.location.latitude),
    longitude: String(pin.location.longitude),
    name: pin.name,
  };
}

function toSingleValue(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function toCoordinate(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  return Number(value.trim());
}

/**
 * `/walk-start` のルートパラメータを、ピンを目的地にした `WalkDestination` に変換する。
 * ディープリンクで任意の値が来うるので検証し、pinId が UUID でない・座標が不正・配列のときは null
 * （null なら散歩開始画面は通常のスポットの候補から選ぶ形で開く）。名前は空なら「目的地」にし、上限で切り詰める。
 */
export function parsePinWalkStartParams(params: PinWalkStartRouteParams): WalkDestination | null {
  const pinId = toSingleValue(params.pinId);
  if (pinId === null || !isUuid(pinId)) return null;

  const latitude = toCoordinate(toSingleValue(params.latitude));
  const longitude = toCoordinate(toSingleValue(params.longitude));
  if (latitude === null || longitude === null) return null;
  const location: GeoCoordinates = { latitude, longitude };
  if (!isValidCoordinate(location)) return null;

  return {
    placeId: `${PIN_DESTINATION_PLACE_ID_PREFIX}${pinId}`,
    name: resolveSpotDisplayName(toSingleValue(params.name)),
    location,
  };
}
