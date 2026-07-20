# デザイントークンの運用 (mobile)

`packages/mobile` のデザイントークン(色・余白・角丸・影・タイポグラフィ・モーション)は
Claude Design プロジェクト「Sanpo Design System」(`ea6ab024-4c09-45b2-94f5-0a6a0315a88d`)からの
codegen で管理する。背景・設計判断は [ADR-005](../adr/ADR-005-design-system-import.md) を参照。

## Single Source of Truth の切り分け

| レイヤー | SSoT | 同期方法 |
| --- | --- | --- |
| トークンの値(色/寸法/角丸/影/モーション) | **Claude Design** | codegen で `tokens.generated.ts` を生成しコミット |
| RN 固有のトークン表現(px 換算・`Easing.bezier`・`fontVariant` 等) | **リポジトリ** | `src/theme/adapters/` に手書き |
| コンポーネント実装 | **リポジトリ** | 手書き。Web JSX は RN の SSoT になり得ない |
| コンポーネント仕様・インベントリ | **Claude Design** | `.prompt.md` / `.d.ts` を参照仕様として読む |
| 画面デザイン | **Claude Design** | `ui_kits/sanpo-app/screens/` を参照 |

**同期の方向は Design → コードの一方向に固定する。** 逆方向(RN 実装を DesignSync へ push)は行わない。

## トークン更新フロー

1. DesignSync で `tokens/colors.css` / `typography.css` / `spacing.css` / `effects.css` / `fonts.css` の
   5ファイルを取得し、**一切加工せず** `design/tokens/` へ上書き保存する。
2. `pnpm --filter mobile design:tokens` を実行する。
   - `design/tokens/*.css` を読み込み、`var()` エイリアスを解決し、light/dark を展開し、
     `src/theme/generated/tokens.generated.ts` を再生成する。
   - 生成直後に `oxfmt` で自動整形される。
3. `design/tokens/*.css` の差分と `tokens.generated.ts` の差分を**まとめて1コミット**する。

CI では `pnpm --filter mobile design:tokens:check`(= 再生成 + `git diff --exit-code`)を実行し、
「CSS を更新したのに生成物を再生成し忘れている」状態を検知する(drift check)。
DesignSync は CI から呼べない MCP ツールのため、**取得(手動)と変換(スクリプト)を分離**している。

## 手編集してよい / してはいけないファイル

| パス | 手編集 |
| --- | --- |
| `design/tokens/*.css` | ❌ 禁止。DesignSync からの生スナップショットのみ |
| `src/theme/generated/tokens.generated.ts` | ❌ 禁止。`design:tokens` の出力のみ(`src/api/generated/` と同じ扱い) |
| `scripts/generate-tokens.ts`, `scripts/design-tokens/**` | ✅ 手書き(codegen 本体) |
| `src/theme/adapters/**` | ✅ 手書き(CSS→RN の値変換。RN 非依存の純粋関数) |
| `src/theme/tokens.ts` | ✅ 手書き(generated + adapters を合成し、用途名(semantic)にマッピングする) |

## `src/theme/` の3層構造

```
src/theme/
├── generated/
│   └── tokens.generated.ts   # DS の primitive 値そのまま。手編集禁止
├── adapters/
│   ├── typography.ts         # 行高倍率→px、em→px、fontVariant: tabular-nums
│   ├── effects.ts             # cubic-bezier のパース、duration の ms 変換
│   └── index.ts
├── tokens.ts                  # generated + adapters を合成し lightTheme/darkTheme を export
└── unistyles.ts                # Unistyles の StyleSheet 設定(配信の仕組み)
```

- `generated/`: DS の値をそのまま持つ。用途名(semantic)を持たない。
- `adapters/`: CSS の値表現(倍率・em・cubic-bezier 文字列など)を RN で使える形に変換する
  **純粋関数**。`react-native` / `react-native-unistyles` / `react-native-reanimated` を値として
  import しない(Vitest で node 環境のままテストできるようにするため)。
- `tokens.ts`: `generated` の primitive を `adapters` で変換しつつ、**用途名(semantic)へマッピング**して
  `lightTheme` / `darkTheme` を組み立てる。コンポーネント側はここだけを参照する。

> **現状(SS-1 完了時点)**: `generated/` `adapters/` `tokens.ts` および `src/components/ui/` の
> 全 primitive・開発用カタログ画面(`/(dev)/catalog`)まで実装済み。設計判断の詳細は
> [ADR-005](../adr/ADR-005-design-system-import.md) を参照。

## codegen が実データから確定させたトークン構造

DS の実 CSS を読んだ結果、`scripts/design-tokens/buildThemes.ts` の `GeneratedTheme` は
以下のカテゴリで構成される(キーはアルファベット順にソートして出力される)。

| カテゴリ | 由来ファイル / 接頭辞 | 値の型 | 備考 |
| --- | --- | --- | --- |
| `colors` | `colors.css` の全トークン | `string` | ブランド primitive・ニュートラル・セマンティックエイリアス・地図・イラスト用パレットを区別せず全て含む |
| `spacing` | `spacing.css` の `--space-*` | `number`(px) | |
| `radius` | `spacing.css` の `--radius-*` | `number`(px。pill は 999) | |
| `sizing` | `spacing.css` の `--control-*` / `--page-gutter` / `--tabbar-height` / `--safe-top` / `--hairline` | `number`(px) | |
| `fontFamily` | `typography.css` の `--font-*` | `string` | |
| `typography` | `typography.css` の `--text-*` / `--weight-*` / `--leading-*` / `--tracking-*` | `string` | 単位変換(px 化・em 換算)は Phase 1 の adapters が行う |
| `shadow` | `effects.css` の `--shadow-*` | `string`(box-shadow 生文字列) | |
| `ring` | `effects.css` の `--ring-*` | `string`(box-shadow 生文字列) | フォーカスリングは UI 上で不採用のため現状未使用。DS に定義があるため生成のみしておく |
| `easing` | `effects.css` の `--ease-*` | `string`(cubic-bezier 生文字列) | |
| `duration` | `effects.css` の `--dur-*` | `string`(例: `"120ms"`) | ms への数値変換は Phase 1 の adapters が行う |

`fonts.css` は Google Fonts の `@import` のみでトークン定義を持たないため、codegen の対象外(空でもパーサは落ちない)。

### `--ill-*`(イラスト用パレット)の扱い

`colors.css` には `--ill-sky` など9個の light 専用イラストパレットが定義されている
(dark に対応物なし)。`buildThemes` は **これらも他の色トークンと同様に区別せず生成する**
(dark 側は light の値をそのまま引き継ぐ)。理由:

- `buildThemes` はファイル横断の機械的な抽出層であり、「どの色を UI で使うか」という
  意匠判断を持ち込まない。判断は `tokens.ts`(semantic 層)の責務にする。
- 除外すると DS がイラストパレットを更新した際に codegen が無言で追従しなくなる。
- IllustrationSlot は「tint パネル + Lucide アイコン」方式を採用する決定
  ([ADR-005](../adr/ADR-005-design-system-import.md) 決定6)のため、
  `--ill-*` を実際に semantic トークンへ昇格させる予定はない。`tokens.ts` では
  これらを `lightTheme` / `darkTheme` の用途名にマッピングしない(生成はされるが未参照のまま)。

> **補足(E-6)**: 以前このセクションは `tmp/SS-1/design-import-proposal.md` を参照していたが、
> `tmp/` はリポジトリの `.gitignore` 対象のため、この参照は他の開発者の環境では必ず切れていた。
> リポジトリ内で完結する [ADR-005](../adr/ADR-005-design-system-import.md) を参照するよう修正した。

## DS の生キー → semantic キーの対応表

[ADR-005](../adr/ADR-005-design-system-import.md) が「詳細は design-tokens.md に対応表を残す」と
約束していたが記載が漏れていた(E-6)。`src/theme/tokens.ts` の `build*` 関数が行っている
主なマッピングを以下にまとめる。**正確な対応は `tokens.ts` のソースを正とする**(このセクションは
理解のための要約であり、`tokens.ts` の変更に追随して更新すること)。

### colors(抜粋。全対応は `buildColors` を参照)

| DS の生キー(kebab-case) | semantic キー(`theme.colors.*`) | 備考 |
| --- | --- | --- |
| `surface-app` | `background` | |
| `surface-card` | `surface` | Card・Input・Dialog 等の既定背景 |
| `surface-raised` | `surfaceElevated` | |
| `surface-sunken` | `surfaceSunken` | |
| `surface-inverse` | `surfaceInverse` | Toast(default tone)の背景等 |
| `text-primary` | `text` | |
| `text-secondary` | `textMuted` | |
| `border-subtle` | `border` | `--ink-200` と同値 |
| `border-strong` | `borderStrong` | |
| `primary-press` | `primaryPressed` | |
| `primary-tint` | `primaryTint` | Button `secondary` の既定背景 |
| `red-600` | `dangerPressed` | Button `danger` 押下時(B-3 対応で追加) |
| `blue-300` | `secondaryPressed` | Button `secondary` 押下時(B-3 対応で追加) |
| `ink-100` | `neutralFill` | ProgressBar のトラック色(B-10 対応で追加。`border`(`ink-200`)とは別値) |
| なし(DS 実物の固定値 `rgba(27, 36, 48, 0.45)`) | `overlay` | Dialog/BottomSheet の背面スクリム(C-6 対応で追加。light/dark で変わらない) |
| `map-park` / `map-cafe` / `map-culture` / `map-station` | `category.park` / `category.cafe` / `category.culture` / `category.station` | Tag・MapPin のカテゴリ色 |
| `--ill-*` | (マッピングしない) | 上記のとおり未参照 |

### spacing / radius / sizing

- `spacing`: DS の `--space-N`(インデックス)を **px 値そのもの**をキーにした
  `{ 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 }` へ正規化(決定8を参照。`buildSpacing` が対応表を持つ)。
- `radius`: DS の命名(`xs`/`sm`/`md`/`lg`/`xl`/`pill`)をそのまま踏襲。
- `sizing`: `control-sm`/`control-md`/`control-lg`/`page-gutter`/`tabbar-height`/`safe-top`/`hairline` を
  camelCase 化(`controlSm` 等)。

### typography

DS の `text-*`/`weight-*`/`leading-*`/`tracking-*` の生スケール値から、用途別ロール
(`display`/`heading`/`headingSm`/`title`/`body`/`bodySm`/`caption`/`label`/`data`/`dataSm`/
`dataUnit`/`badgeLabel`)を組み立てる。各ロールがどの生キーを使うかは `tokens.ts` の
`TYPOGRAPHY_ROLES` を参照(表にすると DS 側の更新のたびに追随漏れが起きやすいため、
表は持たずソースを直接参照する方針とする)。

## 見た目に迷ったら: `design/components/DS-COMPONENT-SPECS.md`

トークン(色・寸法等の値)は上記の codegen で機械的に同期されるが、**コンポーネントの視覚仕様
(パディング・枠線・variant の組み合わせ・アイコン名等)は自動化されていない**。
実装エージェントが DesignSync に接続できない状況で primitive を実装した結果、
DS 実物との差異が複数見つかった(`ds-fidelity-review.md`)ことを受け、
[`design/components/DS-COMPONENT-SPECS.md`](../design/components/DS-COMPONENT-SPECS.md) に
DS の視覚仕様を蒸留したローカルスナップショットを追加した。

- **見た目に迷ったらこの文書を確認する。** ここに無い寸法を発明する前に、DS を再確認すること。
- `design/tokens/*.css` と異なり **drift check の対象外**。DS 側のコンポーネント実装が
  更新されたら、手動でこの文書を追随させる必要がある。
- 出典は Claude Design プロジェクト「Sanpo Design System」の `components/**/*.jsx`。

## デザイン規律(破ると移植した意味が失われる)

- 0〜4px の角丸を使わない。ボタン・タグは常に pill。
- 純黒の影を使わない。影は青灰 `rgba(27,36,48,…)`。
- 緑/紫/赤は地図ピンのカテゴリとセマンティック状態専用。装飾に使わない。
- `fontFamily` は必ず `theme.fontFamily` 経由。直書き禁止。
- `app/` 配下で `react-native-unistyles` の `StyleSheet.create` を使わない
  (`babel.config.js` の Unistyles プラグインが `root: "src"` のみを処理するため)。
