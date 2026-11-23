import {
  LocationPermissionNotice,
  type LocationPermissionNoticeProps,
} from "@/components/location/LocationPermissionNotice";
import {
  WalkRouteNotice,
  type WalkRouteNoticeProps,
} from "@/features/walk/route/components/WalkRouteNotice";
import { ApproximateLocationNotice } from "@/features/walk/shared/components/ApproximateLocationNotice";

export type WalkActiveNoticesProps = {
  walkRouteErrorCode: WalkRouteNoticeProps["errorCode"];
  onRetryWalkRoute: () => void;
  trackingErrorCode: LocationPermissionNoticeProps["errorCode"] | null;
  onRetryTracking: () => void;
  /** 大まかな位置の案内を出すか（`shouldShowApproximateLocationNotice`）。位置の失敗の案内が優先する。 */
  approximateLocation: boolean;
};

/** 散歩中の地図の下に出す案内（ルートの取得の失敗・位置の権限・大まかな位置）。 */
export function WalkActiveNotices({
  walkRouteErrorCode,
  onRetryWalkRoute,
  trackingErrorCode,
  onRetryTracking,
  approximateLocation,
}: WalkActiveNoticesProps) {
  return (
    <>
      <WalkRouteNotice errorCode={walkRouteErrorCode} onRetry={onRetryWalkRoute} />
      {trackingErrorCode !== null ? (
        <LocationPermissionNotice
          errorCode={trackingErrorCode}
          context="tracking"
          onRetry={onRetryTracking}
          testID="walk-active-location-notice"
        />
      ) : null}
      {trackingErrorCode === null && approximateLocation ? (
        <ApproximateLocationNotice context="tracking" testID="walk-active-approximate-notice" />
      ) : null}
    </>
  );
}
