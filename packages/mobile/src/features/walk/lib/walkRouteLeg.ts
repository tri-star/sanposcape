import { distanceMeters } from "@/features/walk/lib/geoDistance";
import {
  DESTINATION_NEAR_RADIUS_METERS,
  distanceToRoutePath,
} from "@/features/walk/lib/routeDeviation";
import type { WalkRoute, WalkRouteLeg, WalkRouteLegKind } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";

/** 往路/復路のどちらを進行中か。 */
export type WalkLegPhase = "outbound" | "return";

/** 往路/復路の判定に使う内部状態（hook が保持する）。 */
export type WalkLegState = {
  phase: WalkLegPhase;
  /** 目的地に一度でも近づいたか（一度 true になったら戻さない）。 */
  reachedDestination: boolean;
};

export const INITIAL_WALK_LEG_STATE: WalkLegState = {
  phase: "outbound",
  reachedDestination: false,
};

/**
 * 復路と判定するために必要な「復路の折れ線のほうが近い」マージン（m）。
 * 往路と復路は出発地・目的地の付近で必ず接近するため、単純な近い方判定では
 * 頻繁に往復して表示がちらつく。ヒステリシスとしてマージンを設ける。
 */
export const LEG_SWITCH_MARGIN_METERS = 40;

/** 指定 kind の leg を返す。無ければ null。同じ kind が複数あれば先に見つかったほうを返す。 */
export function findWalkRouteLeg(
  route: WalkRoute | null,
  kind: WalkRouteLegKind,
): WalkRouteLeg | null {
  if (route === null) return null;
  return route.legs.find((leg) => leg.kind === kind) ?? null;
}

/**
 * 往路と復路が**別経路として描き分けられる**か。
 * `legs` が2件そろっていて、かつ backend がフォールバックしていない場合のみ true。
 */
export function hasDistinctLegs(route: WalkRoute | null): boolean {
  if (route === null) return false;
  if (route.returnIsSamePath) return false;
  return route.legs.length >= 2;
}

/**
 * 測位1件を取り込んでフェーズを更新する。値が変わらなければ同じ参照を返す
 * （`lib/routeRecalculation.ts` の `observeRoutePosition` と同じ規律。無駄な再レンダリングを避ける）。
 *
 * 判定順（この順で評価する）:
 * 1. `route === null` → `state` をそのまま返す。
 * 2. 目的地到達判定（一度 true になったら戻さない）。
 * 3. 到達済みなら return（最も確実な信号を最優先にする）。
 * 4. 既に復路ならフェーズは単調（復路 → 往路には戻さない）。
 * 5. `hasDistinctLegs` が false（フォールバック/片道）なら投影判定をせず outbound のまま。
 * 6. 往路/復路それぞれの折れ線への最短距離を比較し、ヒステリシス付きで判定する。
 *
 * なぜ「投影」だけに寄せないか: 往路と復路は出発地・目的地の周辺で必ず重なるうえ、
 * 経由点方式では両者が数十mまで接近する区間が出うる。目的地到達のラッチを主、投影を従にすることで、
 * フォールバック時にも判定が成立し（＝ UI の分岐が減り）、投影が曖昧な区間でも表示が安定する。
 */
export function observeWalkLeg(
  state: WalkLegState,
  input: { position: GeoCoordinates; route: WalkRoute | null },
): WalkLegState {
  const { position, route } = input;

  if (route === null) {
    return state;
  }

  const reached =
    state.reachedDestination ||
    distanceMeters(position, route.destination.location) <= DESTINATION_NEAR_RADIUS_METERS;

  if (reached) {
    if (state.phase === "return" && state.reachedDestination === true) {
      return state;
    }
    return { phase: "return", reachedDestination: true };
  }

  if (state.phase === "return") {
    if (state.reachedDestination === reached) {
      return state;
    }
    return { phase: "return", reachedDestination: reached };
  }

  if (!hasDistinctLegs(route)) {
    if (state.phase === "outbound" && state.reachedDestination === reached) {
      return state;
    }
    return { phase: "outbound", reachedDestination: reached };
  }

  const outboundLeg = findWalkRouteLeg(route, "outbound");
  const returnLeg = findWalkRouteLeg(route, "return");
  const dOut = outboundLeg ? distanceToRoutePath(position, outboundLeg.path) : null;
  const dRet = returnLeg ? distanceToRoutePath(position, returnLeg.path) : null;

  const nextPhase: WalkLegPhase =
    dOut !== null && dRet !== null && dRet + LEG_SWITCH_MARGIN_METERS < dOut
      ? "return"
      : "outbound";

  if (nextPhase === state.phase && state.reachedDestination === reached) {
    return state;
  }
  return { phase: nextPhase, reachedDestination: reached };
}
