import { LocationPermissionNotice } from "@/components/location/LocationPermissionNotice";
import { SpotListSection } from "@/features/walk/explore/components/SpotListSection";
import { SpotMapView } from "@/features/walk/explore/components/SpotMapView";
import type { UseWalkPlanResult } from "@/features/walk/explore/hooks/useWalkPlan";
import type { WalkDestination } from "@/features/walk/shared/types";
import { ApproximateLocationNotice } from "@/features/walk/shared/components/ApproximateLocationNotice";
import { shouldShowApproximateLocationNotice } from "@/features/walk/shared/lib/locationPrecisionNotice";
import { makeStyles } from "@/theme/makeStyles";

export type WalkStartSpotsProps = {
  plan: UseWalkPlanResult;
  /** ピンを目的地にして開いたときのピン（SS-170）。地図にゴールとして描き、候補一覧は出さない。 */
  pinDestination?: WalkDestination | null;
};

/**
 * ピンを目的地にしたときの地図の高さ（SS-170）。候補一覧・往復時間・カテゴリを出さないぶん空く縦を地図に回す
 * （通常は `SpotMapView` の既定の 296）。
 */
const PIN_DESTINATION_MAP_HEIGHT = 420;

/**
 * 散歩開始画面（`WalkStartView`）の、目的地の候補の地図と一覧。
 *
 * 位置情報が取れていない間は地図・候補リストの代わりに通知だけを出す。
 * 候補は現在地起点でしか出せないため、リストを併置すると「権限エラー」と
 * 「スポットが見つかりません」が同時に出て矛盾した案内になる。
 */
export function WalkStartSpots({ plan, pinDestination = null }: WalkStartSpotsProps) {
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
        fixedDestination={pinDestination}
        height={pinDestination !== null ? PIN_DESTINATION_MAP_HEIGHT : undefined}
        testID="walk-start-map"
        style={styles.map}
      />

      {pinDestination !== null ? null : (
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
      )}
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
