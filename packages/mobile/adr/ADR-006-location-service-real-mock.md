# ADR-006: 位置情報サービスは services 層で real/mock の2モードとし、`dev` を持たない

## 日付

2026-07-30

## ステータス

採用（SS-15）。[ADR-002](./ADR-002-mobile-tech-stack.md) および [folder-structure](../docs/folder-structure.md) の「services は real/dev/mock の3モードが基本形」という方針に対する、**位置情報に限った意図的な例外**を定める。

## コンテキスト

M4「探索・散歩開始」で、散歩開始画面に現在地取得を結線する必要が出た。既存の実機依存機能の抽象化は `src/services/auth` が唯一の実例で、[横断 ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) に従い `real` / `dev` / `mock` の3モードを持っている。

- `real` = 実 Google サインイン（実機・外部IdP依存）
- `dev` = backend の `/auth/dev-session` を使う（本物に近いが Google には触れない）
- `mock` = メモリ上のダミー（ユニットテスト用）

位置情報を同じ層に載せるにあたり、この3モード構成をそのまま踏襲すべきかを決める必要があった。あわせて次の制約がある。

- ユニットテストは node 環境の Vitest で、`react-native` と一部のネイティブモジュールを alias で
  スタブ化している（コンポーネントのレンダリングテストは書けない）。`expo-location` を素通しすると
  テストが動かない。
- E2E（Maestro）はエミュレータ上で実行するが、**エミュレータの位置情報は未設定だと取得に失敗し、
  設定しても反映タイミングがフレークになりやすい**。
- 呼び出し側（`features/walk`）は地図表示にも座標を使うため、`expo-location` と
  `react-native-maps` のどちらの型に依存させるかという選択もある。

## 決定

- `src/services/location/` を新設し、`LocationService` インターフェース（`getPermissionStatus` /
  `requestPermission` / `getCurrentPosition`。**SS-16 で `watchPosition` を追加**。下記「移行・対応が必要な事項」参照）
  を定義する。呼び出し側はこのインターフェースのみを参照する。
- 座標は**自前の `GeoCoordinates`**（`{ latitude, longitude }`）で表現し、`expo-location` /
  `react-native-maps` のどちらの型にも依存しない。地図の表示領域も `lib/mapRegion.ts` に
  構造的互換な `MapRegion` を自前定義し、`react-native-maps` を値 import しない純粋関数として扱う。
- モードは **`real` と `mock` の2つだけ**とし、`dev` は作らない。切り替えは
  `EXPO_PUBLIC_LOCATION_MODE`（`real` | `mock`、既定 `real`）で行い、判定は
  `src/config/locationMode.ts` の `getLocationMode()` の1箇所に集約する。
  - 値の解析は `"mock"` への**完全一致のみ** mock とし、未設定・不正値・大文字混在はすべて `real` に
    フォールバックする（設定ミスを本番安全側に倒す）。
- `expo-location` を import してよいのは `location.real.ts` **のみ**とする。
- `initXxx()` のような初期化関数は持たない（`services/auth` との差分）。権限リクエストは画面側の
  hook（`features/walk/hooks/useCurrentLocation.ts`）が必要になった時点で行う。
- エラーは `LocationError` / `LocationErrorCode`（`permission_denied` / `services_disabled` /
  `timeout` / `unavailable` / `unknown`）に正規化し、UI 文言へのマッピングを services 層に閉じる。
  分類は `instanceof` ではなく型ガード関数で行う（Hermes・トランスパイル環境で `instanceof` が
  不安定になるため。`services/auth` と同じ規律）。
- 単体テストではバレル `index.ts` を import せず、`createMockLocationService()` を直接 import して
  フェイクを注入する（バレルは `getLocationMode()` の結果次第で `location.real.ts` 経由の
  `expo-location` に到達しうるため）。
- E2E（`eas.json` の `preview` プロファイル）は `EXPO_PUBLIC_LOCATION_MODE=mock` を焼き込む。

## 検討した選択肢

### 選択肢1: real/mock の2モード（採用）

`dev` を作らない。実機・エミュレータの位置は OS 設定や `adb emu geo fix` で与えられるため、
「本物に近いが実機依存しない中間実装」に相当するものが存在しない。

### 選択肢2: real/dev/mock の3モードを踏襲する

`services/auth` と形を完全に揃える。ただし `dev` に入れる中身が「固定座標を返す」以外に無く、
それは `mock` と実質同じになる。名前だけ違う2つの同等実装を抱えることになる。

### 選択肢3: services 層を作らず、hook から `expo-location` を直接叩く

ファイル数は最小になるが、ユニットテストで `expo-location` のモックが hook に直結し、
テスト容易性とスタブ差し替え方針（[architecture-guideline](../docs/architecture-guideline.md)）から外れる。

## 決定理由

- 位置情報において `dev` に相当する層が実在しないため、3モードの踏襲は**空の抽象**になる（選択肢2 却下）。
  モードを増やすと切り替えの分岐と設定項目が増える一方、得られるものが無い。
- services 層自体は維持する価値がある（選択肢3 却下）。`expo-location` への依存を1ファイルに閉じ込め、
  ユニットテストと E2E の両方でスタブへ差し替えられる状態は、既存の auth と同じ利点をもたらす。
- 「必要なモードだけ用意してよい」という形にしておけば、将来 `services/camera` などを足すときも
  各機能の実情に合わせて判断できる。3モードは*基本形*であって*義務*ではない、と明文化する。

## 影響

### ポジティブな影響

- `features/walk` が `expo-location` を一切知らないため、探索・地図まわりの純粋ロジックを
  node 環境の Vitest でテストできる。
- E2E で位置情報がフレークにならない（`mock` の東京駅固定座標）。
- 権限リクエストのタイミングを画面側が制御できる（起動時に一括で権限を要求しない）。

### ネガティブな影響・トレードオフ

- `services/auth` と `services/location` でモード数が異なるため、「services は3モード」という
  単純な理解が成り立たなくなる。本 ADR と folder-structure の追記でカバーする。
- `EXPO_PUBLIC_LOCATION_MODE=mock` が誤って production ビルドに入ると、全ユーザーの現在地が
  東京駅固定になる。`eas.json` の `production` には設定せず、リリース前チェックリスト
  （[local-env](../docs/local-env.md)）で確認する運用とする。

### 移行・対応が必要な事項

- `expo-location` の追加により development build の作り直しが必要（`@expo/fingerprint` が変化するため
  E2E の APK キャッシュも1回はミスする）。
- 散歩中の位置トラッキング（`watchPositionAsync` 相当）は SS-16 以降で `LocationService` に
  メソッドを追加する形で拡張する。`mock` 側は連続した座標列を返す実装になる想定。
- （SS-16 で対応）`LocationService.watchPosition(listener, options)` を追加。`real` は
  `Location.watchPositionAsync`、`mock` は `MOCK_TRACK` を一定間隔で通知するスクリプト実装。
  バックグラウンド測位は引き続き対象外。

## 関連情報

- [ADR-002(mobile): 技術スタック](./ADR-002-mobile-tech-stack.md)
- [ADR-002(横断): 認証は Google 直結 + 3モードスタブ](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md)
- [ADR-004: E2E ビルド・CI 戦略](./ADR-004-e2e-build-ci-strategy.md)
- [ADR-007: Expo 設定と Maps キー注入](./ADR-007-expo-config-and-maps-key-injection.md)
- [フォルダ構造](../docs/folder-structure.md)
- [アーキテクチャガイドライン](../docs/architecture-guideline.md)
