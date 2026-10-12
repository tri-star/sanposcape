# ADR-M-005: スタイルは Unistyles をやめ、RN の StyleSheet + テーマ Context にする

## 現在有効な決定（要約）

> 最終更新: 2026-10-12（SS-202）。本節は本文（追補を含む）を要約したもので、一次記録は本文。
> 本文と食い違う場合は本節の誤りとして本節を直す。

### 決定

- **スタイルは react-native-unistyles を使わず、RN 標準の `StyleSheet` と React Context のテーマ配布で書く**。[ADR-M-002](./ADR-M-002-mobile-tech-stack.md) のスタイルの決定を置き換える（本文: ステータス、決定）
- **デザイントークンは `src/theme/tokens.ts` に react-native を import しない素の値で置く**。テーマの決定 `resolveTheme(mode, systemScheme)` は同じファイルの純粋関数で、Vitest でテストする（本文: 決定）
- **テーマ依存のスタイルは `makeStyles((theme) => ({...}))` で作る**。生成結果はテーマ名（light/dark）ごとにキャッシュする（本文: 決定）
- **`ThemeProvider` は保存値を `initialMode` で受け取り、`setMode` の時だけ `onModeChange` で永続化し、ネイティブの外観を `Appearance.setColorScheme` で上書きする**。詳細は [ADR-M-016](./ADR-M-016-theme-mode-preference.md)（本文: 決定、SS-86 追補）
- **トークンの値の SSoT は Claude Design、コンポーネントの実装の SSoT はリポジトリ。同期は Design → コードの一方向で、`tokens.ts` へ手で写す**。コード側から Design へは push しない（本文: SS-202 追補）
- **MCP（DesignSync など）を入力にする自動化は CI で動かない**。drift の検査を作るなら、取得（エージェントが手で実行し生のままコミット）と変換（ネットワーク非依存のスクリプト）を分ける（本文: SS-202 追補）
- **フォントは端末のシステムフォントに任せ、同梱しない**。入れる場合はラテンのみから、ウェイトごとの個別 import で入れる（本文: 移行・対応が必要な事項）
- **development build 前提は変わらない**（`react-native-maps` / `react-native-svg` がネイティブモジュールのため。[ADR-M-003](./ADR-M-003-development-build-and-dev-loop.md)）（本文: 移行・対応が必要な事項）

### 未解決・持ち越し

- ブランドフォントが未定。決まるまでフォントの同梱を見送る（本文: 移行・対応が必要な事項）

## 日付

2026-07-22（2026-10-01 追補: SS-86、2026-10-12 追補: SS-202）

## ステータス

採用。[ADR-M-002](./ADR-M-002-mobile-tech-stack.md) の「スタイル: react-native-unistyles（v3）」の決定を**置き換える**（ADR-M-002 のその他の決定 — 状態管理・地図・Orval — は有効）。
2026-10-12 追補（SS-202）: SS-1 で決めたデザイントークンの SSoT と同期の向きを記録した（下記「SS-202 追補」節）。

## コンテキスト

[ADR-M-002](./ADR-M-002-mobile-tech-stack.md) では、デザイントークンとテーマを型安全に扱える点を評価して **react-native-unistyles v3** を採用した。その後、実際に画面実装を試した段階で次が分かった。

- Unistyles v3 は Nitro（ネイティブ C++/JSI）+ babel プラグイン前提で、**環境起因のエラーが繰り返し発生**した。
- エラーを回避する過程でライブラリ固有の機能（variants・動的テーマ適用など）をほとんど使えなくなり、
  **実質「テーマ付きの StyleSheet」以上の価値が得られていない**状態になった。
- babel プラグインの `root: "src"` 設定により **`app/` 配下はプラグインの対象外**という、
  フォルダ構造と噛み合わない制約も抱えていた。
- vitest は node 環境 + `react-native` スタブで動かしており、Unistyles は追加のモックを必要としていた。

一方、この時点で Claude Design から取り込むデザイントークン（色・余白・角丸・タイポグラフィ・影・地図カテゴリ色）が確定し、
**ライト/ダーク2テーマの切り替え**さえできれば要件を満たすことも明確になった。

## 決定

- **react-native-unistyles を削除する**。
- スタイルは **React Native 標準の `StyleSheet` + React Context によるテーマ配布**で構成する。
  - `src/theme/tokens.ts` — デザイントークン（primitive / semantic）。**react-native を import しない**素の値のみ。
  - `src/theme/themeContext.ts` / `ThemeProvider.tsx` — テーマの配布。`system` のとき `useColorScheme()` に追従する。（SS-86 追補）初期モードは保存値を `initialMode` で注入する。`setMode` の時だけ `onModeChange` で永続化する（同じ値を選び直したときも永続化する）。ネイティブ外観は `mode` に合わせて（初回マウントも含めて）`Appearance.setColorScheme` で上書きする。詳細は [ADR-M-016](./ADR-M-016-theme-mode-preference.md)。
  - `src/theme/useTheme.ts` — `useTheme()` / `useThemeMode()`。
  - `src/theme/makeStyles.ts` — `makeStyles((theme) => ({...}))` でテーマ依存スタイルの hook を作る。
    生成結果はテーマ名（light/dark）をキーにキャッシュする。
- テーマの決定ロジックは純粋関数 `resolveTheme(mode, systemScheme)` として `tokens.ts` に置き、vitest でテストする。
- `babel.config.js` から Unistyles プラグインを削除する。エントリ `index.ts` は Unistyles 初期化のためではなく、
  将来の起動前処理の差し込み口として残す。
- （SS-202 追補）トークンの値の SSoT は Claude Design、実装の SSoT はリポジトリとし、同期は Design → コードの一方向にする。
  詳細は下記「SS-202 追補（SS-1 で決めた運用の記録）」節。

## 検討した選択肢

### 選択肢1: StyleSheet + テーマ Context（採用）

- **概要**: 追加ライブラリなし。トークンを Context で配り、`makeStyles` でテーマ依存スタイルを組む。
- **メリット**: ネイティブ依存・babel プラグインがなく、環境起因の不具合が起きない。`app/` と `src/` で扱いが変わらない。
  vitest でも追加モックが不要。RN の標準 API なので学習・引き継ぎコストが低い。
- **デメリット**: variants やレスポンシブなどの仕組みは自前で用意する必要がある
  （ただし現状必要なのはライト/ダークの2テーマのみ）。

### 選択肢2: Unistyles を継続し、エラーを個別に回避する

- **メリット**: [ADR-M-002](./ADR-M-002-mobile-tech-stack.md) の決定を変えずに済む。
- **デメリット**: 回避のたびにライブラリの機能を捨てており、**払っているコストに見合う価値が残っていない**。

### 選択肢3: NativeWind へ乗り換える

- **メリット**: Tailwind 記法で書ける。
- **デメリット**: ADR-M-002 時点で懸念していた「バージョン変遷による長期運用の不安定さ」は解消していない。
  スタイル記法の全面書き換えになり、乗り換えコストが選択肢1より大きい。

## 決定理由

- 現状の要件は「**デザイントークンをライト/ダークで切り替えて参照する**」ことであり、
  これは Context + `StyleSheet` で十分に満たせる。
- Unistyles を使い続ける理由だったはずの機能を実際には使えておらず、
  **ネイティブ依存と babel プラグインというコストだけが残っていた**。
- 依存を1つ減らすことで、Expo SDK 更新時に壊れる箇所も減る。

## 影響

### ポジティブな影響

- スタイル起因の環境エラーがなくなり、`app/` 配下でも同じ書き方ができる。
- vitest から `src/theme/tokens.ts` を素の値として読めるため、テーマのロジックをテストできる。
- 依存が1つ減る。

### ネガティブな影響・トレードオフ

- variants・ブレークポイントが必要になったら自前で用意することになる。
- テーマ切り替え時は Context 経由で再レンダリングが走る（テーマは2種類・切り替え頻度も低いため許容）。

### 移行・対応が必要な事項

- `src/theme/unistyles.ts` を削除し、`ThemeProvider` を `app/_layout.tsx` に配線済み。
- **development build 前提は変わらない**。`react-native-maps` と、アイコン描画に使う
  `react-native-svg`（`lucide-react-native` の依存）がネイティブモジュールのため、Expo Go は引き続き使えない
  （[ADR-M-003](./ADR-M-003-development-build-and-dev-loop.md) の結論は維持）。
- ネイティブ依存の増減があったため、既存の development build は**作り直しが必要**。
- **フォントは端末のシステムフォントにフォールバックさせる（2026-07-22 時点の決定）**。
  デザイン指定は Noto Sans / Noto Sans JP だが、`@expo-google-fonts/noto-sans-jp@0.4.3` を実測したところ
  **1ウェイトあたり 5.22 MB**（可変フォント版なし・静的9ウェイトのみ）で、デザインが使う4ウェイト
  （400/500/700/800）を同梱すると**アプリに約 21 MB** 上乗せされる（現在の Android JS バンドルは 3 MB）。
  ラテンのみの `@expo-google-fonts/noto-sans` は約 616 KB/ウェイト（4ウェイトで約 2.4 MB）。
  一方 Android のシステムフォントは既に Noto Sans CJK JP であり、差が出るのは主に iOS（ヒラギノ角ゴ）。
  デザインシステムの readme 自体が「フォントファイルの支給が無かったため Google Fonts で代替した」と
  明記しており **Noto Sans は確定仕様ではない**ため、ブランドフォントが決まるまで同梱を見送る。
  - 導入する場合はラテンのみ（約 2.4 MB）から段階的に入れる。
  - **バレル import は禁止**。`@expo-google-fonts/noto-sans-jp` のルート `index.js` は9ウェイト全てを
    `require` しているため、約 47 MB がそのままバンドルされる。必ず
    `@expo-google-fonts/noto-sans-jp/400Regular` の形で個別 import する。

## SS-202 追補（SS-1 で決めた運用の記録）

SS-1（デザイントークンの取り込み）で決め、これまで agent-memory にだけ残っていた運用を、決定として記録する。

### 決定

- **デザイントークンの値の SSoT は Claude Design のプロジェクト「Sanpo Design System」**
  （`ea6ab024-4c09-45b2-94f5-0a6a0315a88d`）。**コンポーネントの実装の SSoT はリポジトリ**（手書き）とする。
- **同期は Design → コードの一方向**。値は Design で決め、`src/theme/tokens.ts` へ手で写す（生成ディレクトリは持たない）。
  コード側から Design（DesignSync）へは push しない。
- トークンが足りないときは、生の色値を書かず、既存のトークン名で表せるかを先に確かめ、足りなければ Design 側への追加を提案する。
- **MCP（DesignSync・Plane・Pencil など）を入力にする自動化は CI で動かない**（MCP はエージェントの実行環境にしか無く、
  GitHub Actions からは呼べない）。drift の検査を作るなら、取得（エージェントが手で実行し、生のままコミット）と
  変換（ネットワーク非依存のスクリプト）を分け、CI では変換の再実行と `git diff --exit-code` にする。

### 決定理由

- 画面デザインは今後も Claude Design で行う。コード側もトークンの SSoT にすると、両方が正しいと主張する状態になる。
- RN は Web と primitive が違うため、Design の Web の JSX からコンポーネントを生成する意味がない（実装はリポジトリで書く）。

### 検討した選択肢

- コード（`tokens.ts`）を SSoT にして Design へ push する: 画面デザインを Design で行う運用と逆向きになり、二重管理になる。不採用。

## 補足: 破棄したブランチとの関係

同じデザイン取り込みを Unistyles ベースで実装したブランチ `feat/ss-1-design-tokens` が存在し、
そちらには `ADR-005-design-system-import.md`（同じ番号の別 ADR）が含まれる。
本 ADR の決定に伴い当該ブランチは破棄する方針のため番号は本 ADR が引き継ぐ。
ブランチを復活させる場合は ADR 番号の付け直しが必要になる。

なお当該ブランチにあった以下の知見は本実装にも取り込んである。
- タップ領域 44px の確保（`src/lib/hitSlop.ts`）
- コンポーネント共通ルールの明文化（`docs/pages-components-guideline.md`）

## 関連情報

- [ADR-M-002: モバイル技術スタック](./ADR-M-002-mobile-tech-stack.md)
- [ADR-M-003: development build 前提と開発ループ](./ADR-M-003-development-build-and-dev-loop.md)
- [ツール・ライブラリ](../docs/toolsets-libraries.md) / [フォルダ構造](../docs/folder-structure.md)
