import { parse, type JsxAST, SvgAst } from "react-native-svg";

import { SANPO_MAP_ICON_ART } from "@/features/pin/data/sanpoMapIconArt";
import type { SanpoMapIconKey } from "@/features/pin/types";

export type SanpoMapIconArtProps = {
  icon: SanpoMapIconKey;
  /** 一辺（px）。省略すると親の大きさいっぱいに描く（`MapPin` の `art` に渡すとき）。 */
  size?: number;
};

/** SVG の解析結果はアイコンごとに1回だけ作り、ピンが何本あっても使い回す（中身は不変の React 要素）。 */
const astCache = new Map<SanpoMapIconKey, JsxAST | null>();

function astFor(icon: SanpoMapIconKey): JsxAST | null {
  let ast = astCache.get(icon);
  if (ast === undefined) {
    ast = parse(SANPO_MAP_ICON_ART[icon]);
    astCache.set(icon, ast);
  }
  return ast;
}

/**
 * SanpoMapIconArt — 地図のアイコンのカラーの画像（Noto Emoji。SS-191。ADR-M-019）。
 * 同期的に描く（画像の読み込みを待たない）ので、`tracksViewChanges={false}` の `Marker` の中でも空にならない。
 * 装飾なので読み上げ対象にしない（何のアイコンかは親のラベルが伝える）。
 */
export function SanpoMapIconArt({ icon, size }: SanpoMapIconArtProps) {
  const dimension = size ?? "100%";
  return (
    <SvgAst
      ast={astFor(icon)}
      override={{
        width: dimension,
        height: dimension,
        accessible: false,
        importantForAccessibility: "no-hide-descendants",
      }}
    />
  );
}
