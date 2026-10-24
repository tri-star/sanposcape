import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchPinNearestStationTag } from "@/features/pin/api/pinNearestStationApi";
import { buildPinNearestStationRequest } from "@/features/pin/lib/pinNearestStationRequest";
import { pinNearestStationQueryKey } from "@/features/pin/lib/pinQueryKeys";
import type { GeoCoordinates } from "@/services/location/types";

/** 駅のデータは backend の版を上げるまで変わらないので、同じ位置では取り直さない。 */
const STATION_STALE_TIME_MS = Number.POSITIVE_INFINITY;
/** 同じ位置で登録画面を開き直したときに引き直さない程度に持つ（無限にすると開いた位置の数だけ溜まる）。 */
const STATION_GC_TIME_MS = 60 * 60_000;

export type UsePinNearestStationTagOptions = {
  location: GeoCoordinates;
  /** サインイン済みで、フラグ `pin_station_tag` が ON で、まだ駅のタグを足していないときだけ引く。 */
  enabled: boolean;
};

/**
 * ピンの登録画面で最初に1回だけ足す、最寄り駅のタグの表記（SS-225）。
 * 取得中・失敗・駅なしはすべて null（補助の機能なので、エラーは出さず保存も待たせない）。
 * 読み取りだけの冪等な POST なので、住所（`usePinAddress`）と同じく1回だけ再試行する。
 */
export function usePinNearestStationTag(options: UsePinNearestStationTagOptions): string | null {
  const request = options.enabled ? buildPinNearestStationRequest(options.location) : null;
  const query = useQuery({
    queryKey: pinNearestStationQueryKey(
      request?.location.latitude ?? Number.NaN,
      request?.location.longitude ?? Number.NaN,
    ),
    queryFn:
      request !== null ? ({ signal }) => fetchPinNearestStationTag(request, { signal }) : skipToken,
    staleTime: STATION_STALE_TIME_MS,
    gcTime: STATION_GC_TIME_MS,
    retry: 1,
  });
  if (request === null) return null;
  return query.data ?? null;
}
