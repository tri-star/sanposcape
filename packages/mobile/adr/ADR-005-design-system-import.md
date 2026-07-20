# ADR-005: Claude Design のデザインシステムを React Native へ移植する

## 日付

2026-07-20

## コンテキスト

Plane Issue SS-1「ClaudeDesignのデザインをimportする」(モジュール M2: デザイン取り込み・UI基盤)。

- Claude Design プロジェクト `ea6ab024-4c09-45b2-94f5-0a6a0315a88d`「Sanpo Design System」に、
  Web(CSS/React)の完成済みデザインシステム(トークン + 21 primitive + 5画面プロトタイプ)が既に存在する。
- `packages/mobile` の `src/theme/tokens.ts` は暫定の緑系プレースホルダで、
  `src/components/ui/` 以下は `.gitkeep` のみの空フォルダだった。
- 本タスクは「デザインをゼロから作る」ではなく「完成済みの Web DS を React Native + Unistyles へ移植する」
  作業であり、Web と RN の primitive・レンダリング環境の違いをどう吸収するかが主な論点になる。
- 事前調査・提案は `tmp/SS-1/design-import-proposal.md`(承認済み)、実装プランは
  `tmp/SS-1/mobile-plan.md` を参照。本 ADR はその過程で確定した設計判断を記録する。

## 決定

### 1. SSoT(Single Source of Truth)のレイヤー分割と一方向同期

トークンの**値**(色・寸法・角丸・影・タイポグラフィ・モーション)は **Claude Design を SSoT** とし、
RN 固有の表現(px 換算・`Easing.bezier`・`fontVariant` 等)と**コンポーネント実装はリポジトリ**を
SSoT とする。同期は **Design → コードの一方向**に固定し、逆方向(RN 実装を DesignSync へ push)は行わない。

`src/theme/` を3層に分離してこの境界をコードで表現する。

```
src/theme/
├── generated/tokens.generated.ts   # DS の primitive 値そのまま(自動生成・手編集禁止)
├── adapters/                        # CSS→RN の値変換(純粋関数。react-native 非依存)
└── tokens.ts                        # generated + adapters を合成し、用途名(semantic)へマッピング
```

コンポーネントは `tokens.ts` が export する `lightTheme` / `darkTheme` のみを参照し、
`generated/` を直接 import しない。

### 2. codegen を fetch(手動)と transform(スクリプト)に分離する

DesignSync はエージェントの MCP ツールであり、GitHub Actions のランナーからは呼べない。
そのため以下のように分離する。

| ステップ | 実行者 | 内容 |
| --- | --- | --- |
| fetch | 実装エージェント(手動) | DesignSync で `tokens/*.css` を取得し `design/tokens/*.css` として無加工でコミット |
| transform | `scripts/generate-tokens.ts`(ネットワーク不要) | `design/tokens/*.css` → `src/theme/generated/tokens.generated.ts` |
| drift check | CI(`design:tokens:check`) | transform を再実行し `git diff --exit-code` |

これにより CI は完全に再現可能になり、かつ「デザイン変更が PR の diff に出る」という要件を
(生の CSS diff + 生成 TS diff の両方が出る形で)満たす。

### 3. 21 primitive の振り分け(移植14 / 作り替え4 / 見送り3)

Web の 21 primitive をそのまま1:1移植せず、RN/Expo のプラットフォーム機構に委ねるべきものは委ねた。

**A. そのまま移植(14個)**: `Icon` / `Button` / `IconButton` / `Card` / `Avatar` / `StatBlock` /
`ProgressBar` / `Badge` / `Tag` / `Toast` / `Input` / `Switch` / `Checkbox` / `Radio`

**B. モバイル向けに作り替え(4個)**:

- `Select`: Web の dropdown は不適のため、`BottomSheet` 上に選択リストを載せる形に作り替える。
- `Dialog`: RN `Modal` の上に DS のスタイルを載せる。
- `BottomSheet`: ジェスチャが必須のため、`react-native-gesture-handler` + `react-native-reanimated`
  で自前実装する(`@gorhom/bottom-sheet` は追加しない。理由は決定7参照)。
- `MapPin`: `react-native-maps` の `Marker` の `children` を想定した、位置指定を持たない見た目
  コンポーネントとして作り替える。雫型は CSS の `border-radius` トリックが RN に無いため
  `react-native-svg` の `Path` で描く。

**C. 見送り(3個)**:

- `Tooltip`: モバイルに hover が無い。必要な箇所は `Toast` か補足テキストに置換する。
- `TabBar`: `expo-router` の `Tabs` に委ねる(見た目だけ DS 準拠のアダプタを渡す)。
- `Tabs`(画面内セグメント切替): 実際に必要になった画面で `features/` 側に作る
  (`docs/folder-structure.md` の「まず features、再利用が起きたら昇格」ルールに従う)。

加えて、DS 側に実イラストが無いための代替として **`IllustrationSlot`** を新設した(決定6参照)。

### 4. render テスト環境は整備せず、スタイル解決の純粋関数化で代替する

現状の `vitest.config.ts` は `environment: "node"` であり、`react-native` は
`Platform` のみの最小スタブに丸ごと差し替えている。RN 本体は Flow 構文を含み node 環境で
パースできず、Unistyles v3 は Nitro Modules ベースで追加のモックが要るため、
`<Button />` を render するテストは現時点で書けない。

**対応**: 各コンポーネントを `Xxx.tsx`(JSX の薄い層)と `xxxStyles.ts`
(`react-native` / `react-native-unistyles` / `react-native-reanimated` を値として import しない
純粋関数)に分離し、後者を `xxxStyles.test.ts` で `lightTheme` / `darkTheme` を直接渡してテストする。
BottomSheet のスナップ判定(`snapPoints.ts`)のように、ジェスチャそのものはテストできなくても
判定ロジックだけを切り出せば `.test.ts` で検証できる。

render レベルの担保は **カタログ画面での目視 + 後続タスクの Maestro** に委ねる。
`docs/architecture-guideline.md` の「UIとロジックの分離を意識し、ロジックを vitest によりテスト
可能とする方針」にそのまま合致する判断であり、SS-1 のスコープでは十分と判断した。

将来 RN component testing 環境(`@testing-library/react-native` + jsdom + RN の Flow 変換 +
Unistyles mocks)を整備する場合の入口として、`react-native-unistyles` が `react-native-unistyles/mocks`
サブパス(jest 向け)を公開していることを記録しておく。整備自体は SS-1 のスコープ外とする。

### 5. フォントはシステムフォントに委ねる

DS は UI テキストを全て Noto Sans / Noto Sans JP と規定しているが、日本語グリフのバンドルは
アプリサイズを数MB増やし、読み込み中のちらつき対策も必要になる。iOS のフォールバックに
Hiragino Kaku Gothic ProN が指定されており、Android は実質 Noto CJK そのものであるため、
**システムフォントに委ねてもデザインの差は小さい**と判断した。

`@expo-google-fonts/noto-sans-jp` は追加しない。ブランド要件として Noto 固定が必須になった場合に
差し替えられるよう、**`fontFamily` は必ず `theme.fontFamily` 経由で参照し直書きしない**規律を敷く。

### 6. イラストは使わず「tint パネル + Lucide アイコン」で代替する

DS の readme に「ロゴ/ワードマークは実物が未提供でプレースホルダ」「イラストは参照画像からの
切り出し1点のみ」と明記されている。DS 自身が dark モード用にイラスト枠の代替パターン
(tint パネル + アイコン)を既に持っていたため、これを **light/dark 共通**で採用する
(light でも実イラストを使わない)。

該当箇所は `IllustrationSlot` コンポーネントに閉じ込め、`kind`(用途識別子)→
`{ iconName, tintColor }` のマッピングテーブルを持たせた。実アセット入手後は
このコンポーネントの中身だけを差し替えればよい。ロゴ/ワードマークも実物が無いため SS-1 では扱わない。

### 7. カタログ画面はビルドから物理除外せず、Redirect でガードする

Expo Router はファイルベースのため、特定ルートをビルドから物理的に除外する公式な仕組みはない。
`app.json` は静的 JSON で条件分岐もできず、Metro の resolver を弄ると開発ビルドと本番ビルドで
Router の型生成(`typedRoutes: true`)がズレて壊れるリスクがある。

**対応**: ルートファイル(`app/(dev)/_layout.tsx` / `app/(dev)/catalog.tsx`)は常に存在させ、
`isCatalogEnabled()`(`__DEV__` または `EXPO_PUBLIC_ENABLE_CATALOG=true`)が false のときは
`<Redirect href="/" />` で UI から到達不能にする。カタログの実体は `src/features/dev-catalog/` に
置き、`_layout.tsx` から動的 import はしない(RN の Metro は tree-shaking が弱く、静的 import でも
バンドルから消えないため動的化の効果が薄い)。

**トレードオフ**: カタログのコード(数十KB程度)は本番バンドルに残る。より強く除外したい場合、
`app.config.ts` へ移行し production プロファイルでのみ `app/(dev)/` を一時退避するビルドフックを
入れる案があるが、複雑さに見合わないため SS-1 では採用しない。

### 8. spacing のキーは DS の index ではなく実 px 値にする

DS の CSS は `--space-4` のような**インデックス**(`4` ≠ 16px)で命名されているが、
これをそのまま semantic 層のキーにすると「`spacing[4]` が 4px ではなく 16px」という
紛らわしさが生まれ、実装時のミスを誘発する。

**対応**: `src/theme/tokens.ts` の `spacing` は **px 値そのものをキー**にした
`{ 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 }` へ正規化する。コンポーネントは
`theme.spacing[16]` のように「見たままの px 数」で参照でき、DS 側のインデックス命名の
知識が無くても直感的に扱える。生成層(`generated/tokens.generated.ts`)は DS のキー
(`"0"`, `"1"`, `"2"`, ...)をそのまま保持し、`tokens.ts` の `buildSpacing` がインデックス→px の
対応表を1箇所に集約する(DS 側の刻み方が変わった場合もこの1関数を直すだけで済む)。

## 検討した選択肢

### SSoT の置き場所

#### 選択肢1: レイヤー分割(採用)

- **メリット**: デザイナーの変更がコードに機械的に反映される。`src/api/generated/`(Orval)と
  同じ「生成物は手編集禁止」のメンタルモデルに乗せられる。
- **デメリット**: パーサ・codegen という機械を追加で保守する必要がある。

#### 選択肢2: コード側を SSoT にし、DS は参考資料に留める

- **メリット**: 追加の仕組みが不要。
- **デメリット**: デザイナーが Claude Design 側で値を変えてもコードに反映されず、
  「両方が正しいと主張する」状態になりやすい。DS の readme が「トークンは今後確実に動く」と
  示唆しているため、早期に codegen化する方が長期的なコストが低いと判断した。

### render テストの整備

#### 選択肢1: スタイル解決の純粋関数化(採用)

- **メリット**: 追加の依存・環境整備が不要。既存の `environment: "node"` のまま実装できる。
- **デメリット**: 実際の描画結果(レイアウト崩れ等)は検出できない。

#### 選択肢2: `@testing-library/react-native` 一式を導入する

- **メリット**: 実際の render 結果を検証できる。
- **デメリット**: RN の Flow 構文変換・Unistyles(Nitro Modules)のモック・jsdom 相当の環境構築が
  必要で、SS-1 のスコープに対して重い。将来必要になった時点で別 Issue として整備する方が適切と判断した。

### BottomSheet の実装

#### 選択肢1: `react-native-gesture-handler` + `react-native-reanimated` で自前実装(採用)

- **メリット**: 依存を増やさない(両パッケージは既に導入済み)。DS のモーション仕様
  (`ease-spring 320ms`)にトークン経由で正確に追従できる。
- **デメリット**: ジェスチャ・アニメーションのロジックを自前で保守する必要がある。

#### 選択肢2: `@gorhom/bottom-sheet` を追加する

- **メリット**: 実装コストが低い。
- **デメリット**: 新規依存が増える。DS のモーション仕様への追従や `theme.motion` トークンとの
  統合をライブラリの API に合わせて曲げる必要がある。

## 決定理由

- Claude Design が今後も画面デザインの主戦場であり続ける前提のため、**トークンの値の同期を
  自動化しないと必ず乖離する**。一方でコンポーネント実装(RN 固有の primitive・ジェスチャ・
  Modal)は Web の JSX から機械的に生成する意味が薄く、手書きで保守する方が正しい。
- SS-1 では実機/エミュレータでの自動 render テストの投資対効果が低い(スコープが primitive の
  地固めであり、画面実装は後続タスク)。ロジックを純粋関数に切り出す方針は
  `docs/architecture-guideline.md` の既定路線とも一致するため、素直にそれで代替した。
- フォント・イラストは「DS の readme 自身が未確定と明記している」領域であり、確定前に
  重い依存(フォント同梱)や不可逆な実装(実イラスト直書き)を持ち込むリスクの方が大きいと判断した。

## 影響

### ポジティブな影響

- デザイン変更が `design/tokens/*.css` の diff として PR に必ず現れ、レビュー可能になる。
- `src/theme/generated/**` の drift check により「CSS を更新したのに再生成し忘れる」事故を
  CI で機械的に検出できる。
- 19個の primitive(移植14 + 作り替え4 + 新設 `IllustrationSlot`)が `testID` /
  `accessibilityRole` を備えた形で揃い、後続の画面実装(SS-2 以降)と Maestro フローの土台になる。
- `xxxStyles.ts` の純粋関数群が、将来 render テスト環境を整備した際にもロジック部分の
  重複実装を避けられる資産として残る。

### ネガティブな影響・トレードオフ

- render レベルのリグレッション(レイアウト崩れ・実際のタップ動作)は自動テストで検出できず、
  カタログ画面での目視と将来の Maestro に依存する。
- カタログ画面のコードは本番バンドルから完全には除外されず、数十KB程度が常駐する。
- フォント・イラストは暫定対応であり、ブランド要件が確定した際に再作業(フォント同梱の是非、
  `IllustrationSlot` の実アセット差し替え)が発生する。
- `spacing` のキー正規化・`radius`/`shadow` などの semantic 命名は DS の生の命名と1:1ではないため、
  DS 側のドキュメント(`.prompt.md`)を読む際に頭の中で対応付けが必要になる
  (`docs/design-tokens.md` に対応表を残すことで緩和する)。

### 移行・対応が必要な事項

- フォント・ロゴ・イラストの実アセットが確定した際は、`theme.fontFamily` の参照先切り替えと
  `IllustrationSlot` の中身差し替えのみで対応できるよう、直書きを増やさないこと。
- render テスト環境(`@testing-library/react-native` 等)が必要になった時点で別 Issue を切る。
- カタログ画面をより強く本番から除外したくなった場合は `app.config.ts` への移行を検討する
  (決定7参照。SS-1 では見送り)。
- 5画面の実装・タブルーティング・backend API 追加・認証は SS-1 のスコープ外(後続タスク)。

## 関連情報

- [design-tokens.md](../docs/design-tokens.md): トークン更新の運用手順・3層構造の詳細
- [architecture-guideline.md](../docs/architecture-guideline.md): UIとロジックの分離・テスト方針
- [folder-structure.md](../docs/folder-structure.md): `src/components/ui/` と `src/features/` の配置判断基準
- `tmp/SS-1/design-import-proposal.md`: 承認済みの事前提案(本 ADR の前提)
- `tmp/SS-1/mobile-plan.md`: 実装プラン(Phase 0〜5 のコミット粒度)
- [ADR-001: フォルダ構造](./ADR-001-folder-structure.md)
- [ADR-002: モバイル技術スタック](./ADR-002-mobile-tech-stack.md)
