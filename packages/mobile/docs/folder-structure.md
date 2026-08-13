# フォルダ構造ガイドライン (mobile)

ReactNative(Expo) アプリのフォルダ構造の方針をまとめる。
背景・選定理由は [ADR-001](../adr/ADR-001-folder-structure.md) を参照。

## 前提

- ルーティング: **Expo Router**（ファイルベースルーティング）
- アーキテクチャ: **ハイブリッド構成**（横断的な土台 + 機能単位の凝集）
- 命名規則の詳細は [命名規則](./naming-conventions.md) を参照

## 全体構造

```
packages/mobile/
├── app/                       # Expo Router: 画面とルーティングのみ
│   ├── _layout.tsx            #   ルートレイアウト（Provider配線・認証ガード）
│   ├── (tabs)/                #   タブグループ
│   │   ├── _layout.tsx
│   │   └── index.tsx          #   画面は薄く保ち、src/features を呼ぶだけにする
│   └── +not-found.tsx
│
├── src/
│   ├── components/            # 横断的に再利用するUI（機能に依存しない）
│   │   ├── ui/                #   Primitive: Button, Text, Card, Input ...
│   │   └── layout/            #   横断的な複合UI（必要に応じカテゴリを追加）
│   │
│   ├── features/             # 機能固有のまとまり（凝集の単位）
│   │   └── <feature>/         #   例: walk, history
│   │       ├── components/    #     その機能でしか使わないUI
│   │       ├── hooks/         #     RN依存の副作用・状態（useState/useEffect等。Vitest対象外）
│   │       ├── lib/           #     判定・整形などの純粋関数（react-native非依存＝Vitestでテスト）
│   │       ├── data/          #     静的データ（ダミーデータ・定数）
│   │       ├── api/           #     その機能のAPI呼び出しラッパ
│   │       ├── store/         #     その機能に閉じたZustandストア（横断化したらsrc/store/へ昇格）
│   │       └── types.ts
│   │
│   ├── services/            # スタブ差し替えの層（認証・実機依存機能）
│   │   └── <service>/
│   │       ├── index.ts       #   環境変数（例: EXPO_PUBLIC_AUTH_MODE /
│   │       │                   #   EXPO_PUBLIC_LOCATION_MODE）で real/dev/mock を
│   │       │                   #   選択して export（既定 real）
│   │       ├── types.ts       #   インターフェース定義
│   │       ├── xxx.real.ts    #   本番実装
│   │       ├── xxx.dev.ts     #   実装は本物に近いが実機/外部IdPに依存しない実装
│   │       │                   #   （例: backend の dev 専用エンドポイントを使う）
│   │       └── xxx.mock.ts    #   テスト用の最小スタブ（メモリ上のダミー実装等）
│   │       # 複雑なサービスは上記に加え、トークン生存管理・エラー分類などの補助ファイルを
│   │       # 持つことがある（例: services/auth の tokenStore.ts / authError.ts）。
│   │
│   ├── api/                  # Orval生成物 & 共通APIクライアント設定
│   │   ├── generated/         #   自動生成物（手編集禁止）
│   │   └── client.ts
│   │
│   ├── hooks/                # 横断的な汎用hook（機能非依存）
│   ├── lib/                  # 汎用ユーティリティ（純粋関数中心＝テスト容易）
│   ├── config/              # 環境変数の読み取り・定数
│   ├── store/               # Zustand ストア（横断的なクライアント状態）
│   ├── theme/               # デザイントークン・テーマ定義（StyleSheet + Context）
│   └── types/               # 横断的な型定義
│
├── assets/                   # 画像・フォント等の静的アセット
├── .maestro/                 # E2Eテストフロー（Maestro）
│   └── subflows/              #   `runFlow` からのみ呼ばれる共通手順（単体では実行されない）
├── docs/                     # 設計ドキュメント
├── adr/                      # ADR（設計判断の記録）
├── app.json / app.config.ts  # Expo設定
├── tsconfig.json             # パスエイリアス @/ → src/
├── vitest.config.ts
└── package.json
```

## 各ディレクトリの役割と配置ルール

### `app/` — 画面とルーティングのみ
- Expo Router の規約により、**ファイル配置がそのままURL/画面構造になる**。
- 画面ファイルには UI/ロジックを直接書かず、`src/features/<feature>/` のコンポーネントや hook を import して**薄く**保つ。
  - 目的: 「UIとロジックの分離」を成立させ、ロジックを Vitest でテスト可能にするため。
- `app/` 配下には**画面（ルート）以外を置かない**。再利用するコンポーネントは必ず `src/` に置く。
- 予約ファイル: `_layout.tsx`（レイアウト）、`+not-found.tsx`、`(group)/`（URLに出ないグループ）、`[param].tsx`（動的ルート）。

### `src/components/` — 機能に依存しない再利用UI
- `ui/`: Primitive（Button, Input, Card など）。どの機能にも依存しない最小単位。
  - **地図オーバーレイ**も `ui/` の1カテゴリとして扱う（例: `ui/map-pin/MapPin.tsx`、
    `ui/route-polyline/RoutePolyline.tsx`）。`MapView` の子としてしか描画できない・単体では
    見た目が確認できないという点で他の Primitive と性質が異なるため、開発確認用ギャラリーの
    扱いも異なる（[pages-components-guideline](./pages-components-guideline.md) 参照）。
- `layout/` など: 横断的な複合UI。**最初から細分化せず、増えてきたらカテゴリ（サブフォルダ）を追加**する。

### `src/features/<feature>/` — 機能固有のまとまり
- 1つの機能に属する `components` / `hooks` / `lib` / `data` / `api` / `store` / `types` をこの配下に凝集させる。
- **`hooks/` は RN 依存の副作用・状態**（`useState`/`useEffect`/`setInterval` など）を持つ層。
  Vitest は `react-native` を最小スタブに差し替えた node 環境のためコンポーネント同様に
  レンダリング/フックのテストはできない（詳細は [pages-components-guideline](./pages-components-guideline.md)）。
- **判定・整形ロジックは `lib/` の純粋関数に切り出す**（`react-native` を値 import しない）。
  こちらが Vitest でのテスト対象になる（`.test.ts` を併置）。
- **`data/`** には静的データ・定数（ダミーデータ、選択肢一覧など）を置く。用途は2種類ある。
  - サーバー由来データを代用する**暫定スタブ**: 将来 `api/`（Orval + TanStack Query）へ差し替わったら削除する
    （SS-29 でこの用途のファイルは解消済み。新たに追加する場合も同様に一時的なものとして扱う）。
  - **恒久的に残る静的データ**: API の enum に対する表示メタ・選択肢一覧（例:
    `features/walk/data/categories.ts`）、開発確認用の代表値（例: `features/walk/data/defaults.ts`）、
    対応する backend API がまだ存在しない設定値（例: `features/history/data/stepGoal.ts`）など、
    API 化される種類のデータではないもの。これらは差し替え対象ではないので残置理由を JSDoc に書く。
  - 画面の主データ（一覧・詳細など、将来 API 化される可能性が高いもの）は、`hooks/` 経由でのみ参照させ、
    View から `data/` を直接 import しない。差し替え時の影響範囲を hook に閉じるため。
  - router params 欠落時のフォールバック定数や、画面カタログ等の開発用途で使う代表値のように、
    実データ化の見込みが薄い値は View からの直接 import を許容する。
- **`store/`** はその機能に閉じたクライアント状態（Zustand）。**サーバー由来のデータは置かない**
  （TanStack Query が保持する。二重管理を避けるため）。
  2つ以上の機能から参照されるようになったら `src/store/` へ昇格させる（コンポーネントの昇格ルールと同じ判断基準）。
  - 実例1: `features/walk/store/useActiveWalkStore.ts`（進行中の散歩 `ActiveWalk`。「今どの散歩をしているか」の識別情報だけを持ち、ルート本体は持たない）。
  - 実例2: `features/walk/store/useFinishedWalkStore.ts`（終了したが保存が確定していない散歩 `FinishedWalk` と保存状態）。
    散歩中画面 → サマリ画面をまたいで保存対象を渡すために、`useActiveWalkStore` とは責務を分けて別ファイルにしている。
  - **いずれも永続化しない**（AsyncStorage / SecureStore を使わない）。保存前にアプリを落とすと記録は失われる。
    ローカル永続化（起動時の再送・散歩の復帰）は SS-19 のスコープ外でフォローアップ課題に送っており、
    着手時は ADR-008 の再追補が必要。
  - **「サーバー由来のデータを置かない」の例外は `useFinishedWalkStore.savedWalkId` の1つだけ**。
    サーバーが採番した識別子（保存成功時の walk id。履歴詳細への遷移に使う）に限って許容し、
    散歩の内容そのもの（`WalkRead`）は入れない。例外を増やす場合は ADR で判断を残すこと。
  - 判断の背景は [ADR-008](../adr/ADR-008-active-walk-state-and-route-cache.md) を参照。
  - **サインアウト時にクリアが必要な store は、`src/lib/sessionCleanup.ts` の `registerSessionCleanup()` に
    自分の後始末を登録する**（ストアのファイル末尾で1回）。`runSessionCleanup()` を呼ぶ実行側は
    `src/store/useAuthSessionStore.ts` の `setSession()`（認証状態が `authenticated → guest` に
    落ちる時点。SS-13 追補）で、store が増えるたびにサインアウト導線を編集しなくて済むようにする。
- **その機能の外から import されるものは置かない**（横断利用が必要になったら昇格させる。下記ルール参照）。

### コンポーネントの配置判断ルール（肥大化対策）
> **「2つ以上の機能から使うか？」**
> - Yes → `src/components/`（`ui/` もしくは適切なカテゴリ）
> - No → `src/features/<feature>/components/`
>
> 迷ったら **まず `features/` に置く**。再利用が実際に発生した時点で `components/` へ昇格させる。
> `components/` 直下にファイルを並べて肥大化させない。カテゴリのサブフォルダに分ける。

### `src/services/` — スタブ差し替えの層
- 認証(OAuth/OIDC)や実機依存機能（カメラ・位置情報など）を抽象化する層。
- 呼び出し側は `index.ts` が公開する**インターフェースのみ**を参照し、real/dev/mock の実体を知らない。
- 実装の選択は環境変数で切り替える（例: `EXPO_PUBLIC_AUTH_MODE`。`real` | `dev` | `mock`、既定 `real`）。
- `real` / `dev` / `mock` の3モードが基本形。`dev` は「本物に近いが実機/外部IdPに依存しない」実装
  （例: `services/auth` の `auth.dev.ts` は backend の `/auth/dev-session` を使い Google には触れない）、
  `mock` はユニットテスト向けの最小スタブ（メモリ上のダミー実装等）という役割分担にする。
- ただし**必要なモードだけ用意してよい**。例: `services/location` は real/mock の2モードのみ
  （Android エミュレータ / 実機の位置設定・`adb emu geo fix` で real のまま再現できるため、
  「本物に近いが実機依存しない中間実装」= `dev` に相当するものが無い。
  詳細は [ADR-006](../adr/ADR-006-location-service-real-mock.md)）。
- テスト方針との対応:
  - **ユニットテスト**: `mock`（または個別モジュールへの直接フェイク注入）を利用する。
    ただし `index.ts`（バレル）はネイティブ依存に到達しうるため、バレルを import せず
    個別モジュール／ファクトリ関数を直接 import するのが安全な場合がある
    （具体例は [architecture-guideline](./architecture-guideline.md) の単体テスト節を参照）。
  - **E2Eテスト(Maestro)**: 実機に近い動作を優先。**Maestroで再現可能な機能は real のまま**利用し、
    再現できない機能は `dev` または `mock` にフォールバックする。
- 実例: `src/services/auth`（real/dev/mock の3モード）、`src/services/location`（real/mock の2モード）。
- 詳細な設計背景は [architecture-guideline](./architecture-guideline.md) を参照。

### `src/api/` — バックエンドAPIクライアント
- `generated/`: Orval による自動生成物。**手編集しない**。
- `client.ts`: 共通のクライアント設定（ベースURL、インターセプタ等）。

### その他
- `src/hooks/`: 機能に依存しない汎用hook。例: `useToast.ts`、`useScreenBack.ts`（画面の「戻る」導線を
  一本化する hook。SS-34。判定ロジックは `src/lib/backNavigation.ts` へ切り出し、hook 自体は
  `react-native` の `BackHandler` に依存するため Vitest 対象外）。
- `src/lib/`: 純粋関数中心の汎用ユーティリティ（Vitestでテストしやすい形を保つ）。機能に依存しない小さな仕組み
  （例: サインアウト時の後始末レジストリ `sessionCleanup.ts`、UUID 生成 `uuid.ts`、「戻る」操作の判定を
  純粋関数に切り出した `backNavigation.ts` の `resolveBackAction`。SS-34）もここに置く。
  - **昇格ルール（コンポーネントの昇格ルールと同じ判断基準）**: `features/<feature>/lib/` にあった
    純粋関数が**2つ以上の機能から使われるようになったら `src/lib/` へ昇格**させる。1機能でしか
    使っていないうちは `features/<feature>/lib/` に置いたままにする。
  - SS-20（`features/history` 追加）で `features/walk/lib/` から実際に昇格した4本:
    - `numberGuard.ts`（`toNonNegative`）— `features/history` と `src/lib/units.ts` の両方から使うため。
    - `geoCoordinate.ts`（`isValidCoordinate`）— ルート・軌跡を `react-native-maps` に渡す直前の
      共通の防波堤。
    - `units.ts`（`toKilometers`）— 散歩ルート・散歩記録の距離表示で共通に使う。
    - `mapRegion.ts`（`MapRegion` 型 / `MIN_REGION_DELTA` / `regionForCoordinates`）— 座標集合から
      地図の表示領域を求める汎用計算。
  - **汎用計算と機能固有の計算は分けたまま昇格する**: 例えば `mapRegion.ts` は「座標集合から表示領域を
    求める」汎用部分（`regionForCoordinates`）だけを `src/lib/mapRegion.ts` へ昇格し、「往復時間から
    到達半径を見積もる」walk 固有の計算（`regionForRoundTrip` / `regionForBounds` /
    `radiusMetersForRoundTrip`）は `features/walk/lib/mapRegion.ts` に残す。同名ファイルが2箇所に
    あること自体は問題ではなく、共有側は汎用型（`MapRegion` / `MIN_REGION_DELTA`）だけを import する。
- `src/config/`: 環境変数の読み取りと定数。
- `src/store/`: Zustand による横断的なクライアント状態。**サーバー由来のデータは置かない**（それは TanStack Query が持つ）。UI状態や一時的なアプリ状態のみ。
  - 実例: `useAuthSessionStore.ts`（認証セッション状態 `loading | authenticated | guest`。SS-13）。
    参照元が `features/auth`（ゲート・スプラッシュ）・`features/settings`（サインアウト導線 /
    guest 向けサインイン導線の出し分け。SS-57）・`app/_layout.tsx`（アプリ全体のゲート）にまたがる
    ため、最初から `src/store/` に置いた（コンポーネントの昇格ルールと同じ判断基準）。
  - **「サーバー由来のデータを置かない」の例外は `useAuthSessionStore.user` も対象**。
    `user` はセッションのライフサイクルと1:1で変わる identity snapshot であり、
    TanStack Query が管理する一般的なドメインデータとは性質が異なるため許容する
    （`authenticated ⟺ user !== null` の不変条件を保つための判断。詳細は
    [ADR-009](../adr/ADR-009-auth-session-state-and-route-gate.md) を参照）。
  - **例外**: `useAuthSessionStore` だけは `registerSessionCleanup()` に自分自身を登録しない
    （このストアは「クリアされる側のデータ」ではなく「セッション状態そのもの」であり、
    `loading` に戻すと `AuthGate` がスプラッシュへ送り返してしまうため）。
    詳細は [ADR-009](../adr/ADR-009-auth-session-state-and-route-gate.md) を参照。
- `src/theme/`: デザイントークン（primitive / semantic）とテーマ定義。`ThemeProvider` がライト/ダークを配り、各コンポーネントは `makeStyles((theme) => ...)` で RN の `StyleSheet` を組み立ててトークンを参照する（[ADR-005](../adr/ADR-005-styling-without-unistyles.md)）。
- `src/types/`: 複数箇所で共有する横断的な型。

## 状態管理の使い分け

- **サーバー状態（API由来）= TanStack Query**。取得・キャッシュ・再検証はすべて Query に任せ、`src/store/` に複製しない。
  - ドメインのデータ取得hookは `src/features/<feature>/hooks/`（例: `useWalkHistory`）に置き、内部で Orval生成物 + TanStack Query を使う。
  - **例外が1つある**: `features/walk/hooks/useWalkRouteRecalculation.ts` は、散歩中の現在地起点ルートを
    Query ではなく hook のローカル state に持つ。Query の入力（`origin`）を動かすと、取得中・失敗時に
    `data` が `undefined` に落ちて**直前まで表示していたルートが画面から消える**ため（`keepPreviousData`
    は pending 中しか効かず error 状態を救えない）。許容範囲は「同じ目的地へ現在地から引き直す1本の
    ルート」に限定し、それ以外のサーバー状態を hook state に持ち出さない。背景は
    [ADR-008 決定7](../adr/ADR-008-active-walk-state-and-route-cache.md) を参照。
  - **更新系（mutation）も同じく `hooks/` に置く**（例: `features/walk/hooks/useWalkSave.ts` — `POST /walks`）。
    `useMutation` の発火・再試行方針・成功時の `invalidateQueries` をここに閉じ、View からは
    「状態（`idle`/`saving`/`saved`/`error`）と再試行関数」だけを見せる。
  - **`features/<feature>/api/` には Orval が生成した「素の fetcher」を薄くラップした関数を置き、
    生成 hook（`useXxx...`）は使わない**（例: `walkApi.ts` の `saveWalk`、`walkRouteApi.ts` の `fetchWalkRoute`）。
    理由は2つ:
    1. queryKey / `enabled` / `retry` / `staleTime`（mutation なら再試行条件）を hooks 層で自前に制御したいため。
    2. 生成 hook は `react-native` を値 import する経路に乗るが、素の fetcher なら乗らないため
       **node 環境の Vitest でテストできる**（msw でレスポンスを差し替えて検証する）。
  - この層は `services/auth` を import しない（認証は `customFetch` が `authTokenProvider` 経由で付ける）。
    `features/walk/**` / `features/history/**` については `.oxlintrc.json` の `no-restricted-imports`
    override（`@/services/auth` 系・`@/store/useAuthSessionStore` への import を禁止）で機械的に
    強制される（SS-13 / [ADR-009](../adr/ADR-009-auth-session-state-and-route-gate.md) 決定8）。
  - **`queryKey` はドメイン名で始める**（散歩記録なら `["walks", ...]`）。`useWalkSave` が成功時に
    `invalidateQueries({ queryKey: ["walks"] })` を呼ぶため、履歴系の取得 hook が別系統のキーだと
    保存直後の一覧が更新されない。
  - **カーソルページネーション（`useInfiniteQuery`）を使う一覧系 hook は、次の規約に従う**
    （実例: `features/history/hooks/useWalkHistory.ts`、`queryKey: ["walks","list",{limit}]`）:
    - `getNextPageParam` は backend レスポンスの `next_cursor` をそのまま返す（`null` なら
      TanStack v5 が「次ページ無し」と解釈する）。
    - **cursor に `null` を渡すクエリパラメータを直接組み立てない**。Orval 生成の URL ビルダー
      （`if (value !== undefined) params.append(key, value === null ? 'null' : String(value))`）は
      `cursor: null` を渡すとリテラル文字列 `"null"` を付けてしまい、backend が 400（Invalid cursor）
      を返す。`cursor` は「文字列かつ空文字でない」ときだけキーを立てる純粋関数
      （例: `features/history/lib/walkHistoryParams.ts` の `buildWalkListParams`）を必ず通し、
      それ以外は `undefined`（＝キーごと作らない）にする。
    - 先頭ページから読み直したいとき（`invalid_cursor` からの復旧・pull-to-refresh）は
      `refetch()` ではなく `resetQueries({ queryKey })` を使う。`refetch()` は同じ壊れたカーソルで
      再取得してしまい復旧できない。
- **クライアント状態（UI・一時状態）= Zustand**。横断的なものだけ `src/store/`、機能限定のものは `src/features/<feature>/store/` に置く。
  - ただし**1画面に閉じる一時状態は store にせず `hooks/` の `useState` に留める**（例: `useWalkPlan` の往復時間・カテゴリ・選択スポット）。
    画面をまたいで保持する必要が出た時点で store 化する（例: `useActiveWalkStore` — 散歩開始画面と散歩中画面をまたぐため）。
- **認証・位置情報などの実機依存**は状態管理ではなく `src/services/` のスタブ差し替え層で扱う。

## パスエイリアス

- `@/` を `src/` に割り当てる（`tsconfig.json` の `paths`）。
  - 例: `import { Button } from "@/components/ui/button/Button"`
- `app/` から `src/` を参照する際も `@/` を使い、相対パスの深いネストを避ける。

## テストファイルの配置

- **テスト対象と同じ場所に併置（co-location）** する。
  - 例: `Button.tsx` と同じフォルダに `Button.test.tsx`。
- E2E（Maestro）のフローのみ、ルートの `.maestro/` に集約する。
  - `.maestro/` 直下＝実行対象のフロー。`.maestro/subflows/`＝複数フローで共有する手順を
    `runFlow` から呼ぶ専用の置き場（Maestro は既定でワークスペース直下の yaml のみ自動実行する
    ため、`subflows/` 配下は単体では実行されない）。

## 環境固有の注意（WSL2 / Linux）

- 開発環境は WSL2/Linux で**大文字小文字を区別する**ファイルシステム。
- macOS（区別しない）と混在すると `import` のcase不一致が Linux でのみ壊れる事故が起きる。
- **import パスは実ファイル名と大文字小文字まで完全一致**させること。
