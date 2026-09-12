import type { WalkingRouteRequest, WalkingRouteType } from "@/api/generated/model";
import { roundCoordinate } from "@/features/walk/lib/placeSearchRequest";
import {
  DESTINATION_NAME_MAX_LENGTH,
  truncateUnicodeCodePoints,
} from "@/features/walk/lib/unicodeText";
import type { WalkDestination } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";

export { DESTINATION_NAME_MAX_LENGTH } from "@/features/walk/lib/unicodeText";

/** Orval 生成 enum をそのまま再 export する（手書きのユニオンを別に定義しない）。 */
export type { WalkingRouteType };

/**
 * 「現在地 → 散歩の出発地」の片道ルートで目的地として表示する名前。
 * backend は place_id も name も無い目的地に対して `name: ""` を返す（日本語の表示文言を発明しない方針）ため、
 * この文言は mobile が持つ。リクエストの `destination.name` と `toWalkRoute` の `fallbackName` の
 * **両方に同じ値を使う**必要があるので、リテラルを2箇所に散らさず定数にする。
 */
export const RETURN_TO_START_DESTINATION_NAME = "出発地点";

/**
 * ルート取得リクエストを組み立てる。送信できない条件なら null を返す。
 * - origin が null / destination が null
 * - `routeType` が省略時（loop）は placeId が空文字なら null
 *   （loop はスポット選択から来るので place id が必ずあるはず。無いなら mobile 側のバグという
 *   不変条件。backend は `place_id` を route_type によらず常に任意にしているため、これは
 *   backend の要求ではなく mobile 側の防御）。
 */
export function buildWalkingRouteRequest(input: {
  origin: GeoCoordinates | null;
  destination: WalkDestination | null;
  /** 省略時は "loop"（周回）。 */
  routeType?: WalkingRouteType;
}): WalkingRouteRequest | null {
  const { origin, destination, routeType = "loop" } = input;
  if (origin === null || destination === null) {
    return null;
  }

  const placeId = destination.placeId.trim();
  if (routeType === "loop" && placeId.length === 0) {
    return null;
  }

  const name = destination.name.trim();

  return {
    // GPS の揺れで queryKey と backend のキャッシュキーが毎回変わるのを防ぐため小数4桁に丸める。
    origin: {
      latitude: roundCoordinate(origin.latitude),
      longitude: roundCoordinate(origin.longitude),
    },
    destination: {
      place_id: placeId.length === 0 ? undefined : placeId,
      // destination.location は /explore/places のレスポンス由来で既に安定しているため丸めない。
      location: {
        latitude: destination.location.latitude,
        longitude: destination.location.longitude,
      },
      name:
        name.length === 0
          ? undefined
          : truncateUnicodeCodePoints(name, DESTINATION_NAME_MAX_LENGTH),
    },
    route_type: routeType,
  };
}

/**
 * 復路（目的地を出た後）にルートを引き直すためのリクエスト。
 * 目的地は「散歩の出発地」であり place id を持たないため、座標のみで指定する
 * （backend は `route_type: "one_way"` かつ `place_id` 省略を受け付ける。`place_id` は
 * `route_type` によらず常に任意である点が確定済み）。
 */
export function buildReturnToStartRouteRequest(input: {
  origin: GeoCoordinates | null;
  /** 散歩の出発地（`ActiveWalk.origin`）。 */
  start: GeoCoordinates | null;
}): WalkingRouteRequest | null {
  const { origin, start } = input;
  if (origin === null || start === null) {
    return null;
  }

  return {
    origin: {
      latitude: roundCoordinate(origin.latitude),
      longitude: roundCoordinate(origin.longitude),
    },
    destination: {
      // place_id は undefined を送る。null を送ると backend の min_length=1 検証に当たり 422 になる
      // （Orval のボディ組み立ての既知の落とし穴。undefined のキーは JSON から落ちる）。
      place_id: undefined,
      location: {
        latitude: roundCoordinate(start.latitude),
        longitude: roundCoordinate(start.longitude),
      },
      name: RETURN_TO_START_DESTINATION_NAME,
    },
    route_type: "one_way",
  };
}
