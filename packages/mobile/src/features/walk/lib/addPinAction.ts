import { isValidCoordinate } from "@/lib/geoCoordinate";
import type { GeoCoordinates } from "@/services/location/types";

export type AddPinAction =
  | { type: "toast"; message: string }
  | { type: "navigate"; params: Record<string, string> };

/**
 * 散歩中画面の「この場所にピンを追加」の遷移先を決める（純粋関数）。
 *
 * `features/walk` は `features/pin` を import しない（feature 間の相互依存を作らないため）。
 * ここで組み立てる `params`（キー名 `latitude`/`longitude`/`clientWalkId`、値は `String(n)`）は
 * `features/pin/lib/pinLocationParams.ts` の `parsePinLocationParams` /
 * `parseClientWalkIdParam` がそのまま読める形を暗黙の契約として維持する
 * （`pinLocationParams.test.ts` 側で互換を固定する）。座標は丸めない。
 */
export function resolveAddPinAction(input: {
  featureEnabled: boolean;
  currentPosition: GeoCoordinates | null;
  clientWalkId: string | null;
}): AddPinAction {
  if (!input.featureEnabled) {
    return { type: "toast", message: "準備中の機能です" };
  }

  if (input.currentPosition === null || !isValidCoordinate(input.currentPosition)) {
    return { type: "toast", message: "現在地を取得できるまでお待ちください" };
  }

  return {
    type: "navigate",
    params: buildPinRouteParams(input.currentPosition, input.clientWalkId),
  };
}

/**
 * 散歩中画面の地図を長押ししたときの遷移先を決める（純粋関数。SS-124）。
 *
 * 長押しは地図を触っているうちに意図せず起きうるため、ボタン（`resolveAddPinAction`）と違って
 * フラグ OFF・座標不正のときはトーストを出さずに何もしない（`null`）。
 * 長押しした地点で `/pins/new` を開き、散歩中なので `clientWalkId` を付ける。
 */
export function resolveMapLongPressPinAction(input: {
  featureEnabled: boolean;
  pressedPosition: GeoCoordinates | null;
  clientWalkId: string | null;
}): Extract<AddPinAction, { type: "navigate" }> | null {
  if (!input.featureEnabled) return null;
  if (input.pressedPosition === null || !isValidCoordinate(input.pressedPosition)) return null;
  return {
    type: "navigate",
    params: buildPinRouteParams(input.pressedPosition, input.clientWalkId),
  };
}

function buildPinRouteParams(
  position: GeoCoordinates,
  clientWalkId: string | null,
): Record<string, string> {
  const params: Record<string, string> = {
    latitude: String(position.latitude),
    longitude: String(position.longitude),
  };
  if (clientWalkId !== null) {
    params.clientWalkId = clientWalkId;
  }
  return params;
}
