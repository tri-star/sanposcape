import type { WalkRoute, WalkRouteLegKind } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";

/** 地図に描く線1本。style は RoutePolyline の見た目の種類。 */
export type WalkRoutePolylineSegment = {
  /** React の key と testID の接尾辞に使う。 */
  kind: WalkRouteLegKind;
  path: GeoCoordinates[];
};

export type WalkRouteLegendItem = {
  /** 凡例の線見本のスタイル（outbound = 実線 / return = 破線）。 */
  kind: WalkRouteLegKind;
  label: string;
};

/** 凡例・注記の語彙。ここを差し替えるだけで文言を一括変更できる。 */
const LEGEND_LABELS = {
  outbound: "行き",
  return: "帰り",
  /** returnIsSamePath のときの outbound 項目のラベル。 */
  outboundSamePath: "行き・帰り（同じ道）",
} as const;

/**
 * 描く線の一覧。描画順は配列順（後ろほど上に重なる）。
 * - returnIsSamePath: 往路1本だけ（逆向きの同じ線を重ねると破線が実線に潰れて見えるため）
 * - それ以外: [復路, 往路] の順（折り返し点・起点付近で重なったとき往路を上にする）
 * - path.length < 2 の区間は含めない
 */
export function walkRoutePolylineSegments(route: WalkRoute): WalkRoutePolylineSegment[] {
  const [outbound, returnLeg] = route.legs;

  if (route.returnIsSamePath) {
    return outbound.path.length >= 2 ? [{ kind: "outbound", path: outbound.path }] : [];
  }

  const segments: WalkRoutePolylineSegment[] = [];
  if (returnLeg.path.length >= 2) {
    segments.push({ kind: "return", path: returnLeg.path });
  }
  if (outbound.path.length >= 2) {
    segments.push({ kind: "outbound", path: outbound.path });
  }
  return segments;
}

/**
 * 凡例の項目。描く線の一覧と必ず一致させる（線が無い項目は出さない）。
 * - returnIsSamePath: [{ kind: "outbound", label: "行き・帰り（同じ道）" }]
 * - それ以外: [{ kind: "outbound", label: "行き" }, { kind: "return", label: "帰り" }]
 *   ※ 片方の path が空ならその項目を除く
 * - 空配列なら凡例自体を出さない
 *
 * `walkRoutePolylineSegments` の結果から導出する（線と凡例の不一致が構造上起きないようにするため）。
 */
export function walkRouteLegendItems(route: WalkRoute): WalkRouteLegendItem[] {
  const segments = walkRoutePolylineSegments(route);
  const kinds = new Set(segments.map((segment) => segment.kind));

  if (route.returnIsSamePath) {
    return kinds.has("outbound")
      ? [{ kind: "outbound", label: LEGEND_LABELS.outboundSamePath }]
      : [];
  }

  const items: WalkRouteLegendItem[] = [];
  if (kinds.has("outbound")) {
    items.push({ kind: "outbound", label: LEGEND_LABELS.outbound });
  }
  if (kinds.has("return")) {
    items.push({ kind: "return", label: LEGEND_LABELS.return });
  }
  return items;
}

/** サマリの補足文言。 */
export function walkRouteLoopNote(route: WalkRoute): string {
  return route.returnIsSamePath ? "帰りは同じ道を戻ります" : "行きと帰りで違う道を歩きます";
}
