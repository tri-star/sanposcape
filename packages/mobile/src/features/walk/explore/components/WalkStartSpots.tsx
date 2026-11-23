import { LocationPermissionNotice } from "@/components/location/LocationPermissionNotice";
import { SpotListSection } from "@/features/walk/explore/components/SpotListSection";
import { SpotMapView } from "@/features/walk/explore/components/SpotMapView";
import type { UseWalkPlanResult } from "@/features/walk/explore/hooks/useWalkPlan";
import { ApproximateLocationNotice } from "@/features/walk/shared/components/ApproximateLocationNotice";
import { shouldShowApproximateLocationNotice } from "@/features/walk/shared/lib/locationPrecisionNotice";
import { makeStyles } from "@/theme/makeStyles";

export type WalkStartSpotsProps = {
  plan: UseWalkPlanResult;
};

/**
 * 散歩開始画面（`WalkStartView`）の、目的地の候補の地図と一覧。
 *
 * 位置情報が取れていない間は地図・候補リストの代わりに通知だけを出す。
 * 候補は現在地起点でしか出せないため、リストを併置すると「権限エラー」と
 * 「スポットが見つかりません」が同時に出て矛盾した案内になる。
 */
export function WalkStartSpots({ plan }: WalkStartSpotsProps) {
  const styles = useStyles();

  if (plan.locationErrorCode !== null) {
    return (
      <LocationPermissionNotice
        errorCode={plan.locationErrorCode}
        context="explore"
        onRetry={plan.retryLocation}
        testID="walk-start-location-notice"
      />
    );
  }

  return (
    <>
      {shouldShowApproximateLocationNotice(plan.locationPrecision) ? (
        <ApproximateLocationNotice context="explore" testID="walk-start-approximate-notice" />
      ) : null}
      <SpotMapView
        origin={plan.origin}
        durationMin={plan.durationMin}
        candidates={plan.candidates}
        selectedSpotId={plan.selectedSpotId}
        onSelectSpot={plan.selectSpot}
        walkRoute={plan.walkRoute}
        testID="walk-start-map"
        style={styles.map}
      />

      <SpotListSection
        candidates={plan.candidates}
        selectedSpotId={plan.selectedSpotId}
        onSelectSpot={plan.selectSpot}
        isLoading={plan.isLoadingCandidates}
        isRefetching={plan.isRefetchingCandidates}
        errorCode={plan.exploreErrorCode}
        onRetry={plan.retryExplore}
        testID="walk-start-spot-list"
      />
    </>
  );
}

const useStyles = makeStyles((theme) => ({
  map: {
    marginHorizontal: theme.layout.pageGutter - 2,
    marginTop: theme.spacing[1],
    borderRadius: theme.radius.lg,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.borderSubtle,
    overflow: "hidden",
  },
}));
