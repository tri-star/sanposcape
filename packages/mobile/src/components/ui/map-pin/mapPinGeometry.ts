/**
 * MapPin のシルエット（SVG パス）・グリフ位置・マーカーの基準点を求める純粋関数（ADR-M-019 D5・D6）。
 * `react-native` も `react-native-svg` も import しない（Vitest でテストするため）。
 */

/** シルエットの白い縁取りの太さ（px）。従来のティアドロップの borderWidth と同じ。 */
export const MAP_PIN_OUTLINE_WIDTH = 2.5;
/** 全体の高さ ÷ 頭の直径。尾の長さ（先端の鋭さ）を決める。実機で見て調整してよい。 */
export const MAP_PIN_HEIGHT_RATIO = 1.45;
/** グリフの一辺 ÷ 頭の直径。 */
export const MAP_PIN_GLYPH_RATIO = 0.46;
export const DEFAULT_MAP_PIN_SIZE = 40;
/** これより小さい・数値でない size は DEFAULT_MAP_PIN_SIZE として扱う。 */
export const MIN_MAP_PIN_SIZE = 12;

export type MapPinGeometry = {
  /** レイアウト枠の幅（= 頭の直径 = size）。 */
  width: number;
  /** レイアウト枠の高さ（= round(size * MAP_PIN_HEIGHT_RATIO)）。先端の縁取りの外側がちょうど下端に来る。 */
  height: number;
  /** viewBox = `0 0 width height` の SVG パス。頭の円 + 2本の接線で作るシルエット。 */
  path: string;
  outlineWidth: number;
  /** 頭の円（縁取りの中心線の半径）。 */
  head: { cx: number; cy: number; r: number };
  /** 先端（パスの頂点。縁取りの外側は y + outlineWidth/2 = height）。 */
  tip: { x: number; y: number };
  /** グリフの一辺と左上の位置（頭の円の中心に置く）。 */
  glyph: { size: number; left: number; top: number };
};

/** 小数2桁に丸め、末尾の 0 を落とした文字列にする。 */
function fmt(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function computeMapPinGeometry(size: number): MapPinGeometry {
  const s = Number.isFinite(size) && size >= MIN_MAP_PIN_SIZE ? size : DEFAULT_MAP_PIN_SIZE;
  const width = s;
  const height = Math.round(s * MAP_PIN_HEIGHT_RATIO);
  const o = MAP_PIN_OUTLINE_WIDTH;

  // 縁取りは線の中心から両側へ o/2 なので、外側が枠の上・左・右にちょうど接する。
  const cx = s / 2;
  const cy = s / 2;
  const r = (s - o) / 2;
  // strokeLinejoin="round" なので、縁取りの外側は tipY + o/2 = height に来る。
  const tipY = height - o / 2;

  // 先端から頭の円へ引いた接線の接点。
  const d = tipY - cy;
  const theta = Math.acos(r / d);
  const px = r * Math.sin(theta);
  const py = cy + r * Math.cos(theta);

  const path = [
    `M ${fmt(cx)} ${fmt(tipY)}`,
    `L ${fmt(cx - px)} ${fmt(py)}`,
    `A ${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(cx + px)} ${fmt(py)}`,
    "Z",
  ].join(" ");

  const g = Math.round(s * MAP_PIN_GLYPH_RATIO);

  return {
    width,
    height,
    path,
    outlineWidth: o,
    head: { cx, cy, r },
    tip: { x: cx, y: tipY },
    glyph: { size: g, left: cx - g / 2, top: cy - g / 2 },
  };
}

/**
 * `Marker` に spread する基準点。Android（Google Maps）は `anchor`、iOS（Apple Maps / MapKit）は
 * `centerOffset` しか見ないので両方返す（それぞれ他方では無視される）。
 */
export function mapPinMarkerPlacement(size: number): {
  anchor: { x: number; y: number };
  centerOffset: { x: number; y: number };
} {
  const { height } = computeMapPinGeometry(size);
  return {
    anchor: { x: 0.5, y: 1 },
    // MapKit は既定で View の中心を座標に置く。高さの半分だけ上へずらすと下端中央 = 先端が座標に来る。
    centerOffset: { x: 0, y: -height / 2 },
  };
}
