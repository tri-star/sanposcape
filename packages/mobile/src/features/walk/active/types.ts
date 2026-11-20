import type { WalkDestination } from "@/features/walk/shared/types";
import type { GeoCoordinates } from "@/services/location/types";

/**
 * 進行中の散歩。サーバー由来ではない「どの散歩を今やっているか」だけを持つ
 * （ルート本体は TanStack Query が保持する）。
 */
export type ActiveWalk = {
  /** 保存の冪等キー。**散歩開始時**に採番し、終了・再送でも変えない（ADR-003 D3）。 */
  clientWalkId: string;
  /** 散歩の起点（＝周回の終点）。現在地の更新では書き換えない。 */
  origin: GeoCoordinates;
  destination: WalkDestination;
  /** 散歩開始時点の周回ルート全体の目安（分・四捨五入）。/explore/routes の実ルート値。 */
  loopMinutes: number;
  /** 同上（km・小数1桁）。 */
  loopKm: number;
  startedAtMs: number;
};
