import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

import { WalkStartView } from "@/features/walk/explore/components/WalkStartView";
import {
  type PinWalkStartRouteParams,
  parsePinWalkStartParams,
} from "@/features/walk/explore/lib/pinWalkDestination";

/**
 * 散歩開始画面（タブ外の全画面）。
 *
 * ピン詳細の「このピンまで散歩する」からは `pinId`・`latitude`・`longitude`・`name` を付けて push され、
 * そのピンを目的地にして開く（SS-170。ADR-M-027）。ディープリンクで任意の値が来うるので parse で検証し、
 * 不正なら（パラメータが無い通常の入り方と同じく）スポットの候補から選ぶ形で開く。
 */
export default function WalkStartRoute() {
  const { pinId, latitude, longitude, name } = useLocalSearchParams<PinWalkStartRouteParams>();
  // 毎レンダー新しいオブジェクトにすると目的地の参照が変わり続けるので、パラメータの値でメモ化する。
  const pinDestination = useMemo(
    () => parsePinWalkStartParams({ pinId, latitude, longitude, name }),
    [pinId, latitude, longitude, name],
  );
  return <WalkStartView pinDestination={pinDestination} />;
}
