import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchPinDefaultName } from "@/features/pin/api/pinAddressApi";
import { buildPinAddressRequest } from "@/features/pin/lib/pinAddressRequest";
import { pinDefaultNameQueryKey } from "@/features/pin/lib/pinQueryKeys";
import type { GeoCoordinates } from "@/services/location/types";

/** 同じ位置の住所は変わらないので、画面を開き直しても取り直さない。 */
const STALE_TIME_MS = 30 * 60_000;

export type PinDefaultNameStatus = "idle" | "loading" | "ready" | "unavailable";

export type UsePinDefaultNameResult = {
  /** 位置の住所から作ったピン名の初期値。未取得・取得できなかったとき・住所が無いときは null。 */
  name: string | null;
  /** idle = 取得しない、ready = 初期値あり、unavailable = 失敗または住所なし。 */
  status: PinDefaultNameStatus;
};

export type UsePinDefaultNameOptions = {
  location: GeoCoordinates | null;
  /** ルートから注入される isSignedIn（ゲストで 401 を踏みに行かない）。 */
  enabled: boolean;
};

/**
 * ピン登録画面の名前の初期値（位置の住所。SS-138）。
 * 補助機能なので、失敗してもエラーは出さず null にする（名前は自由入力でき、空なら「無題のピン」）。
 * 位置を調整すると別のキーで取り直し、取得中は null になる（前の位置の住所を出さない）。
 * `customFetch` の一時障害の再送は GET / HEAD だけでこの POST には効かないので、読み取りだけの冪等な
 * 呼び出しとして TanStack Query で1回だけ再試行する（それでも失敗したら、位置を変えるまで初期値なし）。
 */
export function usePinDefaultName(options: UsePinDefaultNameOptions): UsePinDefaultNameResult {
  const request =
    options.enabled && options.location !== null ? buildPinAddressRequest(options.location) : null;
  const query = useQuery({
    queryKey: pinDefaultNameQueryKey(
      request?.location.latitude ?? Number.NaN,
      request?.location.longitude ?? Number.NaN,
    ),
    queryFn:
      request !== null ? ({ signal }) => fetchPinDefaultName(request, { signal }) : skipToken,
    staleTime: STALE_TIME_MS,
    retry: 1,
  });

  if (request === null) return { name: null, status: "idle" };
  if (query.isPending) return { name: null, status: "loading" };
  const name = query.data ?? null;
  return { name, status: name !== null ? "ready" : "unavailable" };
}
