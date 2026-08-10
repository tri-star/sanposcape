# frontendのアーキテクチャについてのガイドライン

## スマホアプリ固有機能の扱い
- Expo GoやCI上で利用できない可能性のある機能は起動時にスタブ実装で差し替える仕組みを用意することを検討する。
  初回実装時に実装手段を検討し、ユーザーと相談の上決定する。

## 認証の扱い
- 実装方針は [ADR-002(横断): 認証は Google 直結 + 自前セッショントークン + 3モードスタブ](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) で確定済み。
- `EXPO_PUBLIC_AUTH_MODE`（`real` | `dev` | `mock`。既定 `real`）で real/dev/mock を切り替える（`src/config/authMode.ts`）。
- 認証状態の参照は `@/store/useAuthSessionStore` に一本化する（`authService.getCurrentUser()` を UI から呼ばない）。
- 未認証を弾くゲートは `app/_layout.tsx` の `AuthGate` の1箇所。弾く条件は `features/auth/lib/authGate.ts` の `canEnterProtectedRoutes`。
- `src/features/walk/` / `src/features/history/`（探索・散歩・履歴のロジック）は認証状態に依存させない。`@/services/auth` 系・`@/store/useAuthSessionStore` への import は `.oxlintrc.json` の `no-restricted-imports` override でエラーになる。
- 詳細は [ADR-009: 認証セッション状態を1箇所に集約し、認証ゲートで未認証を弾く](../adr/ADR-009-auth-session-state-and-route-gate.md) を参照。

## 位置情報の扱い
- 実装方針は [ADR-006: 位置情報サービスは real/mock の2モード](../adr/ADR-006-location-service-real-mock.md) で確定済み。
- `EXPO_PUBLIC_LOCATION_MODE`（`real` | `mock`。既定 `real`）で切り替える（`src/config/locationMode.ts`）。
  認証と異なり `dev` モードは持たない（エミュレータ/実機の位置設定で real のまま再現できるため）。
- 呼び出し側（`features/walk`）は `src/services/location` のインターフェースのみを参照し、
  `expo-location` / `react-native-maps` の型には依存しない（自前の `GeoCoordinates` を使う）。

## テストの方針

- E2Eテスト
  - 方針: 実機に近い体験、backendとの統合をテストする。
  - 認証: `EXPO_PUBLIC_AUTH_MODE=dev`（backend の `/auth/dev-session` を利用。backend API は実物）
  - 位置情報: `EXPO_PUBLIC_LOCATION_MODE=mock`（エミュレータの位置がフレークになりやすいため）
  - Backend API: 実際のAPIを利用する
  - 地図タイルの描画は assert しない（描画自体はキー注入により CI でも行われるが、外部タイルの
    取得結果に E2E の成否を依存させないため）。`/explore/places` を前提とするフローには
    `maps-required` タグを付けるが、**CI では SS-54 でタグの絞り込みをやめ `.maestro/` 配下の
    全フローを実行している**。backend 側は SS-44 の `MAPS_MODE=fake`（決定的な fake provider）
    で候補を返すため、外部データへの依存はない。タグは依存を用意できないローカル環境向けの
    絞り込み手段として残している。候補の**件数・内容は assert せず**存在のみを見る
    （詳細は [ADR-004](../adr/ADR-004-e2e-build-ci-strategy.md)）。
  - 履歴などデータ件数に依存する assert は行わない（同一 CI ラン内で他フローの記録が残るため）。
  - モバイル機能: Maestro経由で利用可能な機能はそのまま利用する。利用できない機能はスタブ実装を利用する。

- 単体テスト
  - 方針: `vitest.config.ts` は node 環境 + `react-native` の最小スタブ差し替えのため、
    **コンポーネントのレンダリングテストは書けない**（詳細は
    [pages-components-guideline](./pages-components-guideline.md)）。そのため以下の層で担保する。
    - 純粋ロジック（`lib/`）: `react-native` を値 import しない判定・整形関数を vitest でテスト。
    - 静的スタブの不変条件（`data/`）: id の一意性・値域・代表値の整合などを vitest でテスト。
    - ストア（`store/`）: Zustand ストアは React 非依存（`create()` の戻り値を
      `useXxxStore.getState()` / `setState()` で直接操作できる）ため、初期値・状態遷移・
      リセットの不変条件を vitest でテストする（例: `useFinishedWalkStore.test.ts`）。
      各テストの冒頭で `setState` により初期状態へ戻し、テスト間で状態を持ち越さないこと。
    - API 呼び出し（`api/`）: 生成 hook ではなく素の fetcher をラップしているため
      `react-native` に到達せず、msw（`src/test/setup.ts` の `server`）でレスポンスを
      差し替えて vitest でテストできる（例: `walkApi.test.ts`）。成功時の戻り値・送信ボディ・
      ステータス別の `ApiError` を検証する。
    - 画面の見た目: 開発確認用ルート（`/dev-screens` の `ScreenCatalog`）で目視確認する。
    - `hooks/` と `components/` は上記のいずれにも入らない（レンダリングテストが書けないため）。
      **テストしたいロジックは `lib/` の純粋関数へ切り出す**のが原則。
  - 認証: `services/auth` のバレル（`index.ts`）は import しない。バレルはモード判定
    (`getAuthMode()`) の結果に応じて `googleSignIn.ts`（ネイティブ依存
    `react-native-nitro-google-signin`。エイリアス未設定）へ到達しうるため、テスト環境の
    `EXPO_PUBLIC_AUTH_MODE` 設定だけでは安全にならない。単体テストでは
    `createMockAuthService()`（`src/services/auth/auth.mock.ts`）や `createSessionAuthService()`
    などの個別モジュールを直接 import し、フェイクを注入してテストする
    （`createSessionAuthService.test.ts` 等を参照）。
  - 位置情報: `services/location` も同じ規律で、バレル（`index.ts`）を単体テストから import
    しない（`getLocationMode()` の結果次第で `location.real.ts` 経由の `expo-location`
    （ネイティブ依存）に到達しうるため）。単体テストでは `createMockLocationService()`
    （`src/services/location/location.mock.ts`）を直接 import してフェイクを注入する
    （`location.mock.test.ts` を参照）。
  - Backend API: スタブ実装を利用(Orvalの生成物を利用)
  - モバイル機能: スタブ実装を利用

## テスト容易性
vitestによるユニットテストでもなるべく広い範囲をテスト可能にするため、
UIとロジックの分離を意識し、ロジックをvitestによりテスト可能とする方針を目指す。
併せて `features/<feature>/data/` の静的スタブについても、値の不変条件（id一意性・値域など）を
vitestで守り、手編集による崩れをCIで検知できるようにする。
