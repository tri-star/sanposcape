# ページ、コンポーネント実装ガイドライン

## 全般

現時点ではユーザーにReactNative開発の経験が少なく、大まかな方針を示す。
必要に応じ更新しながら改善を目指す。

- UIパーツはなるべくコンポーネント化し、再利用性を高める。
- componentsフォルダ直下にコンポーネントを集めると簡単に肥大化するため、
  カテゴリ毎にサブフォルダを作成する。
- ボタンなどの「共通的」なコンポーネントと、特定機能のために作成する「機能別コンポーネント」もフォルダを分けて管理する。

## primitive コンポーネントの実装パターン(SS-1 で確立)

`src/components/ui/<component>/` 配下の primitive(Button・Card・Input 等)は、
以下の**3点セット構成**で実装する。`src/features/<feature>/components/` 側の
複合コンポーネントでも、見た目のロジックが複雑な場合は同じパターンを踏襲してよい。

```
src/components/ui/button/
├── Button.tsx           # JSX を組み立てる薄い層(StyleSheet.create + resolve 関数の呼び出しのみ)
├── buttonStyles.ts       # 見た目を決める純粋関数(react-native 非依存)
└── buttonStyles.test.ts  # buttonStyles.ts のテスト(Vitest)
```

### 1. `xxxStyles.ts` — 見た目を解決する純粋関数(RN 非依存)

- `resolveXxxAppearance(theme, args)` という形の関数を1つ以上定義し、
  props/state(variant・size・disabled・pressed 等)から色・寸法・角丸などの
  「見た目の値」を計算して返す。
- **`react-native` / `react-native-unistyles` / `react-native-reanimated` を値として import しない**
  (型のみの `import type` は可)。Vitest の `environment: "node"` のままテストできるようにするため。
- `theme` は `@/theme/tokens` の `AppTheme`(`lightTheme` / `darkTheme`)を引数で受け取る。
  グローバルな `useUnistyles()` はここでは使わない。
- hitSlop(タップ領域の補正値)を計算する場合は `src/lib/resolveHitSlop.ts` を使い、
  同じ計算式をコンポーネントごとに再実装しない。

### 2. `Xxx.tsx` — JSX を組み立てる薄い層

- スタイルは `react-native-unistyles` の `StyleSheet.create` で解決する。
  **`useUnistyles()` は使わない**(テーマ/ランタイム変更のたびに再レンダーが発生するため。
  詳細は [ADR-005](../adr/ADR-005-design-system-import.md) 決定9を参照)。

  ```ts
  const styles = StyleSheet.create((theme) => ({
    root: (args) => resolveButtonAppearance(theme, args),
  }));
  // 呼び出し側: <Pressable style={({ pressed }) => styles.root({ ...args, pressed })} />
  ```

- `useUnistyles()` は、ネイティブ `style` プロパティではなく**コンポーネント props**として
  テーマ値が必要な場合(`Pressable` の `hitSlop`、`Icon`/`Svg` の `color`/`name`、
  Reanimated の `withTiming` に渡す duration/easing 等)にのみ最小限で使ってよい。
  使う場合は「なぜ `StyleSheet.create` で表現できないか」をコメントで説明する。
- `Xxx.tsx` 自体は render テストを持たない(ADR-005 決定4)。ロジックはできる限り
  `xxxStyles.ts` 側に寄せ、`Xxx.tsx` は「値を JSX に配線するだけ」の状態を保つ。

#### Reanimated と組み合わせる場合(`Animated.View` 等)の注意(SS-1 実機確認で判明)

- **`Animated.*`(`Animated.View` / `Animated.Text` 等)に Unistyles のスタイルを渡してはいけない。
  動的関数スタイル(`styles.xxx({...})`)も、静的プロパティ(`styles.xxx`)も同様にダメ。**
  解決結果が**空オブジェクト**になり、実機で
  `[Reanimated] Invalid value for "unistyles_xxxx": an empty object is not a valid style value.`
  というクラッシュになる。**型チェック/Lint/Vitest では検出できない実行時エラー**で、
  実機かエミュレータで画面を開いて初めて分かる。
- **代わりに、`useUnistyles()` の `theme` からプレーンな JS のスタイルオブジェクトを組み、
  `[プレーンなオブジェクト, animatedStyle]` の形で渡す。**
  実例: `src/components/ui/switch/Switch.tsx`(`knobBaseStyle`)、
  `src/components/ui/bottom-sheet/BottomSheet.tsx`(`sheetBaseStyle`)。
  Unistyles の機構を一切経由しないため、babel の処理状況に依存せず確実に動く。
- Unistyles と組み合わせるのは **`Animated.*` ではない要素**に限る。
  同じコンポーネント内でも、素の `View` / `Pressable` に渡す分には `StyleSheet.create` を
  そのまま使ってよい(例: `Switch` のトラックは `Pressable` なので `styles.track({...})` のまま)。

> **背景**: Unistyles v3 の babel プラグインは `react-native-reanimated/src/component` を
> 処理対象に含んでおり(`plugin/index.js` の `REPLACE_WITH_UNISTYLES_PATHS`)、公式ドキュメントも
> `<Animated.View style={[styles.container, animatedStyle]} />` を Good 例として挙げている。
> しかし本プロジェクトの構成(Unistyles 3.3.0 + Reanimated 4.5.0 + Expo SDK 57 / pnpm hoisted)では
> 実機で機能しなかった。原因は未特定。将来 `withUnistyles(Animated.View)` や babel 設定での
> 解決を試す余地はあるが、現時点では上記の回避策を標準とする。

### 3. トークン参照の規律

- 色・寸法・角丸・影・タイポグラフィは必ず `theme.colors` / `theme.spacing` / `theme.radius` /
  `theme.shadow` / `theme.typography` 経由で参照し、16進数カラーコードや px 値を直書きしない。
  DS の実寸が `theme.spacing` のスケールに乗らない場合(例: `Button` の水平パディング
  16/22/28、`Tag` の 14px パディング)は、直書きのリテラル値を使ってよいが、
  「DS 実寸のためリテラル値」であることをコメントで明記する。
- `fontFamily` は必ず `theme.fontFamily` 経由で参照する(直書き禁止。
  [design-tokens.md](./design-tokens.md) のデザイン規律を参照)。
- 見た目に迷ったら [`design/components/DS-COMPONENT-SPECS.md`](../design/components/DS-COMPONENT-SPECS.md)
  (DS の視覚仕様のローカルスナップショット)を確認する。DS が更新されても自動追随しないため、
  実際の Claude Design と乖離していないか気づいた時点で更新すること。

### 4. `app/` にスタイル実体を置かない

- `app/`(Expo Router の画面ファイル)には `StyleSheet.create` を書かない。
  `babel.config.js` の Unistyles プラグインは `root: "src"` のみを処理するため、
  `app/` 配下に置くとテーマ依存の検出が効かない。
  スタイルを持つ実体は必ず `src/features/<feature>/components/` に置き、
  `app/` の画面ファイルはそれを import するだけにする。

### 5. アクセシビリティ

- タップ可能な要素には `accessibilityRole`(`button` / `checkbox` / `radio` / `switch` 等)と、
  必要に応じて `accessibilityLabel` / `accessibilityState` を付ける。
- タップ領域は最低 44×44px を確保する。見た目のサイズが小さい場合は `hitSlop` で補う
  (`src/lib/resolveHitSlop.ts` を参照)。
- 装飾目的のみの要素(ドットバッジ・イラストプレースホルダ等)は
  `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"` で
  スクリーンリーダーから隠す。

### 6. カタログ登録

- `src/components/ui/` に primitive を追加したら、開発用カタログ画面
  (`src/features/dev-catalog/`、`/(dev)/catalog` からアクセス)にセクションを追加する。
- `src/features/dev-catalog/catalogEntries.ts` は「`src/components/ui/` の全フォルダに
  対応するセクションが `CatalogScreen.tsx` に存在するか」を検証する最小限のマニフェストであり、
  実際のバリエーション一覧・デモの props は `CatalogScreen.tsx` の JSX 側に書く
  (`catalogEntries.ts` に variants 等の詳細情報を持たせて二重管理しない。詳細はコード内コメント参照)。
