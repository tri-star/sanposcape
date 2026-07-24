---
name: mock-and-prop-divergence
description: 画面デザインの一次資料(mock)の場所と、mock/DS の Web props と RN 実装 props の食い違い
metadata:
  type: reference
---

## 画面デザインの一次資料
`packages/mobile/docs/mock/ウォーキングコース検索アプリ.dc.html` が全画面の実マークアップ。
- `sc-if value="{{ isXxx }}"` ブロック単位で画面が分かれる（isLogin/isStart/isMain/isDetail/isEdit/isSearch/isRecord）。
- 末尾 `<script type="text/x-dc">` の `DCLogic` クラスに `SPOTS`/`CATS`/`state`/`renderVals()` があり、
  ダミーデータ・数値計算式（km=elapsedSec/720 等）・遷移ロジックの正解が全部ここにある。
- 補助: `docs/mock/_ds/.../{readme.md(文言トーン・ビジュアル原則),component-api.md(Props早見),tokens/*.css}`。
- トークン値は既に `src/theme/tokens.ts` に移植済み。mock の `var(--*)` は theme キーに読み替える（[[design-system-ssot]]）。

## mock/DS の props と RN 実装 props は名前が違う（写経禁止）
component-api.md や .dc.html は **Web の JSX** なので、RN 実装（`src/components/ui/*`）と prop 名がずれる。
- `onClick` → `onPress`（Button/IconButton）、`onChange`(input) → `onChangeText`(Input)
- `full-width` → `fullWidth`、`checked`/`onChange` はトグル系で維持
- Button.variant に RN では `ghost` が追加。IconButton.variant は `tinted|ghost|surface`。
- ハンドラ（onPress/onChange）は**必須**設計。非スコープ操作は disabled 明示か Toast の noop にする
  （「押せるのに何も起きない」を作らない、が pages-components-guideline のルール）。

**How to apply:** 画面プランで既存プリミティブを使うときは、mock の属性名をそのまま書かず
実ファイルの `export type XxxProps` を読んで RN 名に読み替えてから記載する。
