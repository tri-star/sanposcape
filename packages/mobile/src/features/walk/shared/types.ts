import type { GeoCoordinates } from "@/services/location/types";

// walk の2つ以上の領域（探索・ルート・散歩中・記録）が使い、持ち主の領域を1つに決められない型。
// 1つの領域だけが使う型はその領域の types.ts に置く（ADR-M-001 決定2）。

/** 散歩ルートの目的地（Expo Router の route と混同しないよう walkRoute 系の語彙で統一する）。 */
export type WalkDestination = {
  /** Google の place id（SpotCandidate.id）。 */
  placeId: string;
  name: string;
  location: GeoCoordinates;
};
