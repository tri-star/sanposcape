import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchPinAddress } from "@/features/pin/api/pinAddressApi";
import type { PinAddress, PinAddressStatus } from "@/features/pin/lib/pinAddress";
import { buildPinAddressRequest } from "@/features/pin/lib/pinAddressRequest";
import { pinAddressQueryKey } from "@/features/pin/lib/pinQueryKeys";
import type { GeoCoordinates } from "@/services/location/types";

/**
 * ピンの位置は変わらない（位置の編集は無い）ので、一度引いた住所は取り直さない。
 * 詳細を開き直す・戻ってくる・同じ位置のピンを開くときに Geocoding API を呼ばないため（SS-212）。
 * サインアウトでセッションの後始末が消すので、端末の上でも利用者をまたいで使い回さない。
 */
const ADDRESS_STALE_TIME_MS = Number.POSITIVE_INFINITY;
/** 画面を離れてもしばらく持つ（gcTime を無限にすると、開いたピンの数だけ溜まり続ける）。 */
const ADDRESS_GC_TIME_MS = 24 * 60 * 60_000;

export type UsePinAddressResult = {
  address: PinAddress | null;
  /** ready = 住所あり、unavailable = 失敗・住所なし・引かない（座標が不正・未サインイン）。 */
  status: PinAddressStatus;
};

export type UsePinAddressOptions = {
  location: GeoCoordinates | null;
  /** ルートから注入される isSignedIn（ゲストで 401 を踏みに行かない）。 */
  enabled: boolean;
};

/**
 * ピン詳細に出す、ピンの位置の住所（SS-212）。住所は DB に保存しないので、開いたときに引く。
 * 補助の表示なので、失敗してもエラーは出さず「-」にする。
 * `customFetch` の一時障害の再送は GET / HEAD だけでこの POST には効かないので、読み取りだけの冪等な
 * 呼び出しとして TanStack Query で1回だけ再試行する。
 */
export function usePinAddress(options: UsePinAddressOptions): UsePinAddressResult {
  const request =
    options.enabled && options.location !== null ? buildPinAddressRequest(options.location) : null;
  const query = useQuery({
    queryKey: pinAddressQueryKey(
      request?.location.latitude ?? Number.NaN,
      request?.location.longitude ?? Number.NaN,
    ),
    queryFn: request !== null ? ({ signal }) => fetchPinAddress(request, { signal }) : skipToken,
    staleTime: ADDRESS_STALE_TIME_MS,
    gcTime: ADDRESS_GC_TIME_MS,
    retry: 1,
  });

  if (request === null) return { address: null, status: "unavailable" };
  if (query.isPending) return { address: null, status: "loading" };
  const address = query.data ?? null;
  return { address, status: address !== null ? "ready" : "unavailable" };
}
