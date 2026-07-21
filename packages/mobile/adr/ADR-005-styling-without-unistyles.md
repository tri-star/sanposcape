# ADR-005: スタイルは Unistyles をやめ、RN の StyleSheet + テーマ Context にする

## 日付

2026-07-22

## ステータス

採用。[ADR-002](./ADR-002-mobile-tech-stack.md) の「スタイル: react-native-unistyles（v3）」の決定を**置き換える**（ADR-002 のその他の決定 — 状態管理・地図・Orval — は有効）。

## コンテキスト

[ADR-002](./ADR-002-mobile-tech-stack.md) では、デザイントークンとテーマを型安全に扱える点を評価して **react-native-unistyles v3** を採用した。その後、実際に画面実装を試した段階で次が分かった。

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
  - `src/theme/themeContext.ts` / `ThemeProvider.tsx` — テーマの配布。`system` のとき `useColorScheme()` に追従する。
  - `src/theme/useTheme.ts` — `useTheme()` / `useThemeMode()`。
  - `src/theme/makeStyles.ts` — `makeStyles((theme) => ({...}))` でテーマ依存スタイルの hook を作る。
    生成結果はテーマ名（light/dark）をキーにキャッシュする。
- テーマの決定ロジックは純粋関数 `resolveTheme(mode, systemScheme)` として `tokens.ts` に置き、vitest でテストする。
- `babel.config.js` から Unistyles プラグインを削除する。エントリ `index.ts` は Unistyles 初期化のためではなく、
  将来の起動前処理の差し込み口として残す。

## 検討した選択肢

### 選択肢1: StyleSheet + テーマ Context（採用）

- **概要**: 追加ライブラリなし。トークンを Context で配り、`makeStyles` でテーマ依存スタイルを組む。
- **メリット**: ネイティブ依存・babel プラグインがなく、環境起因の不具合が起きない。`app/` と `src/` で扱いが変わらない。
  vitest でも追加モックが不要。RN の標準 API なので学習・引き継ぎコストが低い。
- **デメリット**: variants やレスポンシブなどの仕組みは自前で用意する必要がある
  （ただし現状必要なのはライト/ダークの2テーマのみ）。

### 選択肢2: Unistyles を継続し、エラーを個別に回避する

- **メリット**: [ADR-002](./ADR-002-mobile-tech-stack.md) の決定を変えずに済む。
- **デメリット**: 回避のたびにライブラリの機能を捨てており、**払っているコストに見合う価値が残っていない**。

### 選択肢3: NativeWind へ乗り換える

- **メリット**: Tailwind 記法で書ける。
- **デメリット**: ADR-002 時点で懸念していた「バージョン変遷による長期運用の不安定さ」は解消していない。
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
  （[ADR-003](./ADR-003-development-build-and-dev-loop.md) の結論は維持）。
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

## 補足: 破棄したブランチとの関係

同じデザイン取り込みを Unistyles ベースで実装したブランチ `feat/ss-1-design-tokens` が存在し、
そちらには `ADR-005-design-system-import.md`（同じ番号の別 ADR）が含まれる。
本 ADR の決定に伴い当該ブランチは破棄する方針のため番号は本 ADR が引き継ぐ。
ブランチを復活させる場合は ADR 番号の付け直しが必要になる。

なお当該ブランチにあった以下の知見は本実装にも取り込んである。
- タップ領域 44px の確保（`src/lib/hitSlop.ts`）
- コンポーネント共通ルールの明文化（`docs/pages-components-guideline.md`）

## 関連情報

- [ADR-002: モバイル技術スタック](./ADR-002-mobile-tech-stack.md)
- [ADR-003: development build 前提と開発ループ](./ADR-003-development-build-and-dev-loop.md)
- [ツール・ライブラリ](../docs/toolsets-libraries.md) / [フォルダ構造](../docs/folder-structure.md)
