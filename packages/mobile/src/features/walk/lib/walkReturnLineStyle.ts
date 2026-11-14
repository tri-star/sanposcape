import type { MapRenderer } from "@/config/mapRenderer";

/** 往路と同じ線の太さ（`RoutePolyline` の既定）。 */
const ROUTE_STROKE_WIDTH = 5;

/**
 * Google Maps の復路の破線パターン（線の長さ, 間隔）。Android は px（下記）。
 * iOS の Google Maps（SS-267）は react-native-maps が `GMSStyleSpans(..., kGMSLengthRhumb)` に渡すので、線に沿ったメートルになり、
 * ズームで見た目が変わる（散歩の縮尺では数 pt の破線）。iOS の実機では未確認（ADR-M-008 決定9 の SS-267 追補）。
 * Android:
 * `RoutePolyline` の `lineCap="round"` のとき、react-native-maps は線の長さを捨てて丸い点（直径 = 線の太さ）にし、
 * 間隔は端末の px のまま渡す。そのため「丸い点の細かな点線」に見える（2026-09-16 の実機確認。ADR-M-008 決定9）。
 */
const ANDROID_DASH_PATTERN = [12, 8];

/**
 * iOS で見せたい点線（pt）。点の長さ 1 + 丸い線端で直径 5 の点になり、点と点の隙間は 9 − 5 = 4。
 * Android の点線と同じくらいの細かさにする。
 */
const IOS_VISUAL_DASH_PATTERN = [1, 9];

/**
 * iOS（Apple Maps）で、破線を付けた線の太さと破線パターンが拡大されて描かれる倍率（SS-232）。
 * 課題に添付された iPhone のスクリーンショット1枚では、太さ 5・[12, 8] の復路の太さが約 2.5〜2.7 倍（12.5〜13.4pt）、
 * 破線の周期が約 2.2 倍だった（同じ太さ 5 の実線の往路は約 5pt）。一様な拡大とは完全には合わないため、間の値を採った。
 * react-native-maps は値をそのまま `MKPolylineRenderer` に渡しており、拡大は MapKit 側で起きている。
 * ズーム・画面の倍率（@2x / @3x）・iOS の版で倍率が変わるかは確かめていない。
 */
const IOS_DASHED_LINE_SCALE = 2.5;

export type WalkReturnLineStyle = {
  strokeWidth: number;
  dashPattern: number[];
};

/**
 * 周回ルートの復路（帰り）の線の太さと破線パターン（SS-33 / SS-232）。
 * Apple Maps（iOS で Google Maps のキーを入れていないビルド）は MapKit が破線の線を拡大して描くため、見せたい値を倍率で割って渡し、
 * 往路と同じ太さの細かな点線に見せる。Google Maps（Android と、SS-267 以降の iOS）はそのままの値を渡す。
 */
export function walkReturnLineStyle(mapRenderer: MapRenderer): WalkReturnLineStyle {
  if (mapRenderer === "apple") {
    return {
      strokeWidth: ROUTE_STROKE_WIDTH / IOS_DASHED_LINE_SCALE,
      dashPattern: IOS_VISUAL_DASH_PATTERN.map((value) => value / IOS_DASHED_LINE_SCALE),
    };
  }
  return { strokeWidth: ROUTE_STROKE_WIDTH, dashPattern: [...ANDROID_DASH_PATTERN] };
}
