---
name: pitfalls
description: TypeScript/React/RN でハマった落とし穴(__DEV__ の globalThis 型、Rules of Hooks違反、丸め済み値からの派生計算、後付けバリデーションと既存テスト、flex内のFlatListのflex:1、React Compiler の preserve-manual-memoization / set-state-in-effect 警告、app.config.ts の ConfigContext.config は Partial 型)
metadata:
  type: feedback
  scope: durable
---

## `__DEV__` を `globalThis.__DEV__ = ...` で代入すると TS2339 になる

React Native の型定義(`node_modules/react-native/src/types/globals.d.ts`)は
`declare global { const __DEV__: boolean; ... }` という **`const`** 宣言になっている。
TypeScript の既知の挙動として、`declare global` 内の `const`/`let` はバレ識別子としての参照
(`if (__DEV__) {...}`)はできるが、**`typeof globalThis` の型には反映されない**(`var` なら反映される)。

そのため:

- 生成コード側で `globalThis.__DEV__ = false;` と書くと `Property '__DEV__' does not exist on type
  'typeof globalThis'` で落ちる。
- **対応**: `Object.assign(globalThis, { __DEV__: false });` を使う(型チェックを迂回しつつ実行時には
  正しく `globalThis.__DEV__` に代入される)。
- テスト側で一時的に上書きしたい場合は `vi.stubGlobal("__DEV__", true)` を使う(こちらは元から
  文字列キー引数なので型エラーにならない)。

## Rules of Hooks: 早期 return を持つコンポーネントで hook の呼び出し順を崩しやすい

「マウント状態を内部 state で遅延させ、閉じるアニメーション完了後にアンマウントする」パターン
(`if (!mounted) return null;` を JSX の直前に置く)を書くとき、`useAnimatedStyle` などの hook を
うっかりその return の**後**に書いてしまうミスをした(oxlint はこれを検出しなかった)。
**全ての hook 呼び出しは早期 return より前に配置する**こと。実装後は目視で hook の呼び出し順を確認する。

## 派生指標（ペース等）は表示用に丸めた値ではなく生値から計算する

`formatPace(durationSeconds, distanceMeters)`（`features/history/lib/walkMetrics.ts`）が
`toKilometers(distanceMeters)`（表示用に小数1桁へ丸めた km）を使ってペースを計算していたため、
2143m/1920秒のような例で約2%のズレ（14'56"/km のはずが15'14"/km になる）が出ていた（SS-20レビュー指摘）。
**表示用の丸めとロジック内部の計算を同じ関数に混ぜない**: 丸めは表示直前の1箇所（呼び出し側が
`toKilometers` を呼ぶ／`.toFixed(1)` する）に留め、内部計算は `toNonNegative(meters) / 1000` のような
生値を使う。同種の「複数の表示値から別の指標を導出する」処理を書くときは、どこか1つの丸め済み値を
再利用していないか確認する。

## バリデーションを既存関数に追加すると、プレースホルダーIDを使う既存テストが通信前に落ちる

`fetchWalkDetail(walkId)` に `isUuid()` 検証を追加したところ、既存テストが `walkId` として
`"walk-1"` のような非UUID文字列を渡していたため、msw のモックハンドラに届く前に 404 で失敗するように
なった（SS-20レビュー対応）。**関数に入力検証を後付けするときは、その関数を呼んでいる既存テストの
フィクスチャ値（特に `"xxx-1"` のような仮の識別子）が新しい検証条件を満たすか必ず確認する**。
満たさない場合はテスト側のフィクスチャを検証条件に合う値（例: 実際のUUID形式）に更新する。

## flex column の中の `FlatList` / `ScrollView` には明示的な `flex: 1` が要る

画面ルートの `View` が flex column（`{ flex: 1, backgroundColor: ... }`、第1子に非 flex の
ヘッダー）のとき、第2子に置く `FlatList` / `ScrollView` には `contentContainerStyle` とは別に
**それ自身の `style={{ flex: 1 }}`** が必要。無いと RN がリストに伸びるための高さ境界を与えないため、
`data` や children が空でなくても潰れて空っぽに見えることがある。

SS-20 で `WalkHistoryListView`（`FlatList`）と `WalkDetailView`（`ScrollView`）を作った際に踏んだ。
どちらもヘッダー `View`（auto height）の後に `contentContainerStyle` だけを持つリストを置いていた。
`flatList` / `scrollView` の style キーに `flex: 1` を足して解消。

**How to apply:** `<View style={{flex:1}}><Header/><FlatList .../></View>` やその `ScrollView` 版を
組むときは、`contentContainerStyle` だけでなく **FlatList/ScrollView 自身に `flex: 1` を必ず付ける**。

## `useEffect` 内の「他の state からの純粋な派生」setState は `react(set-state-in-effect)` 警告を出す

React Compiler 有効時（`app.json` の `experiments.reactCompiler`）、oxlint は `useEffect` の中で
setState する箇所に `react(set-state-in-effect): Calling setState synchronously within an effect
can trigger cascading renders` という warning（exit code は 0 のまま）を出すことがある（SS-124、
`usePinLocationPicker.ts` で発見）。既存の非同期 I/O（`fetch`・位置情報取得など）の完了時に
setState する effect では出ないが、**「他の props/state から値を計算して setState するだけ」の
effect**（例: 「初回だけ他の state から初期値を確定させる」「特定条件になったら1回だけ別の state
を更新する」）で発生しやすい。

**直し方**: 該当箇所を `useEffect` から外し、レンダー本体で条件付きに直接 `setState` する
（React 公式ドキュメントが「レンダー中に state を直接調整する」パターンとして明示的に認めている
形）。

```ts
// Before（警告が出る）
useEffect(() => {
  if (startRegion !== null) return;
  const resolved = resolve(...);
  if (resolved !== null) setStartRegion(resolved);
}, [startRegion, ...deps]);

// After（警告なし。外部から見える契約は同じ）
if (startRegion === null) {
  const resolved = resolve(...);
  if (resolved !== null) setStartRegion(resolved);
}
```

条件が満たされている間しか setState を呼ばない（無限ループにならない）ことを確認すること。
外部から見える hook の型・振る舞いは変わらないため、呼び出し側の変更は不要。

## `react(preserve-manual-memoization)` 警告が出たら手動メモ化を削る

`app.json` の `experiments.reactCompiler: true` 有効時、`useMemo` / `useCallback` の依存配列が
React Compiler の静的解析と食い違うと oxlint が `react(preserve-manual-memoization): Existing
memoization could not be preserved` を出す（exit code は 0）。典型例は、依存に毎レンダー新しい参照に
なる値（別の `useMemo` の結果等）や state setter を含めている場合（`exhaustive-deps` 警告も併発しやすい）。

**直し方（SS-88）**: 計算が軽量なら **`useMemo` / `useCallback` ごと外して素の計算・素の関数定義にする**
（React Compiler がビルド時に自動メモ化する）。外してよい目安: 子が `React.memo` でない、計算が
文字数チェックや10件未満の配列走査程度。残すべきもの: `useQuery` / `useMutation` の `queryKey`・
オプションオブジェクト、`useEffect` の依存に渡すオブジェクト、実際に高コストな計算。
参照実装: `src/features/pin/hooks/usePinRegister.ts`。

## `app.config.ts` のヘルパーは `Partial<ExpoConfig>` で受ける

`ConfigContext.config` の型は `Partial<ExpoConfig>`（`ExpoConfig` ではない）。ヘルパー関数の引数・戻り値を
`ExpoConfig` にすると `config.name` 等が `string | undefined` のため tsc で型エラーになる。
識別子・scheme の確認は `expo config --type public --json`、Maps キー注入の確認は
`expo config --type prebuild --json`（`GOOGLE_MAPS_ANDROID_SDK_KEY=DUMMY` を付ける）を使い分ける。
`APP_VARIANT` の分岐方針そのものは `packages/mobile/adr/ADR-M-007-expo-config-and-maps-key-injection.md`
（SS-79 追補）が正本。
