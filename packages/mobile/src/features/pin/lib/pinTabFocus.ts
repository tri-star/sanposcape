import { type PinRouteParams, parsePinLocationParams } from "@/features/pin/lib/pinLocationParams";
import type { GeoCoordinates } from "@/services/location/types";

/**
 * ピン詳細の「ピンの場所に移動」で、ピンタブの地図をピンの位置へ寄せる要求（SS-246）。
 *
 * ピンタブ（`/(tabs)/pins`）のルートパラメータで渡す。`focusKey` は押すたびに変わる値で、
 * 同じピンへもう一度移動したときも寄せ直せるようにする（ピンタブは常駐するので、パラメータが残る）。
 */
export type PinTabFocus = { target: GeoCoordinates; key: string };

export type PinTabFocusRouteParams = PinRouteParams & {
  focusKey?: string | string[];
};

/** `/(tabs)/pins` に渡すパラメータを作る。キー名は `/pins/new` と同じ `latitude`/`longitude`（`parsePinLocationParams` で読む）。 */
export function buildPinTabFocusParams(
  location: GeoCoordinates,
  key: string,
): { latitude: string; longitude: string; focusKey: string } {
  return {
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    focusKey: key,
  };
}

/**
 * ルートパラメータを寄せる要求に変換する。ディープリンクで任意の値が来うるので、座標は
 * `parsePinLocationParams` で検証し、`focusKey` が無い・空・配列なら null（ピンタブを普通に開いたとき）。
 */
export function parsePinTabFocusParams(params: PinTabFocusRouteParams): PinTabFocus | null {
  const key = typeof params.focusKey === "string" ? params.focusKey.trim() : "";
  if (key.length === 0) return null;
  const target = parsePinLocationParams(params);
  if (target === null) return null;
  return { target, key };
}

/**
 * 「ピンの場所に移動」を出してよいピンか。アーカイブ済みのピンはピンタブの地図に出ない
 * （地図表示から常に除外。ADR-M-021）ので、寄せても見つからない。
 */
export function canMoveToPinOnPinTab(pin: { archived: boolean }): boolean {
  return !pin.archived;
}
