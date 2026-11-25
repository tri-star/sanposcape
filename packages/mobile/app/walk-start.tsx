import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";
import { WalkStartView } from "@/features/walk/explore/components/WalkStartView";
import {
  type PinWalkStartRouteParams,
  parsePinWalkStartParams,
} from "@/features/walk/explore/lib/pinWalkDestination";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";

/**
 * 散歩開始画面（タブ外の全画面）。
 *
 * ピン詳細の「このピンまで散歩する」からは `pinId`・`latitude`・`longitude`・`name` を付けて push され、
 * そのピンを目的地にして開く（SS-170。ADR-M-027）。ディープリンクで任意の値が来うるので parse で検証し、
 * 不正なら（パラメータが無い通常の入り方と同じく）スポットの候補から選ぶ形で開く。
 * フラグ `pin_walk_destination` が OFF の間はパラメータを無視する（ディープリンクで施行日の前に記録が残らないように）。
 */
export default function WalkStartRoute() {
  const { pinId, latitude, longitude, name } = useLocalSearchParams<PinWalkStartRouteParams>();
  const pinWalkDestinationEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.pinWalkDestination);
  // 毎レンダー新しいオブジェクトにすると目的地の参照が変わり続けるので、パラメータの値でメモ化する。
  const pinDestination = useMemo(
    () =>
      pinWalkDestinationEnabled
        ? parsePinWalkStartParams({ pinId, latitude, longitude, name })
        : null,
    [pinWalkDestinationEnabled, pinId, latitude, longitude, name],
  );
  return <WalkStartView pinDestination={pinDestination} />;
}
