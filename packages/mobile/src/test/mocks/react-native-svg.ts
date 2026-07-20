/**
 * vitest (node環境) 用の react-native-svg モック。
 * `react-native-svg` の実体は内部で `react-native` を import しており、
 * `react-native` 本体(Flow構文)と同様に node 環境ではパースできない。
 * `lucide-react-native`(Icon.tsx が単一入口として使う)がロード時に
 * `react-native-svg` の各 SVG 要素コンポーネントを参照するため、
 * ロジックテスト(iconRegistry.test.ts 等)がそのまま実行できるよう
 * 最小限のダミーコンポーネントを用意する。render はテスト対象外のため、
 * 各コンポーネントは実装を持たない no-op で十分。
 */
function createNoopComponent(name: string) {
  const component = () => null;
  component.displayName = name;
  return component;
}

export const Svg = createNoopComponent("Svg");
export const Circle = createNoopComponent("Circle");
export const Ellipse = createNoopComponent("Ellipse");
export const G = createNoopComponent("G");
export const Line = createNoopComponent("Line");
export const Path = createNoopComponent("Path");
export const Polygon = createNoopComponent("Polygon");
export const Polyline = createNoopComponent("Polyline");
export const Rect = createNoopComponent("Rect");

export default {
  Svg,
  Circle,
  Ellipse,
  G,
  Line,
  Path,
  Polygon,
  Polyline,
  Rect,
};
