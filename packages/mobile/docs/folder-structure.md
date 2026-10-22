# フォルダ構造ガイドライン (mobile)

ReactNative(Expo) アプリのフォルダ構造の方針をまとめる。
背景・選定理由は [ADR-M-001](../adr/ADR-M-001-folder-structure.md) を参照。

この文書は大まかな構造と配置のルールだけを持つ。個々のファイルの役割はファイル冒頭の JSDoc を、設計の経緯は ADR を正とする。

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
├── index.ts                   # エントリ。`expo-router/entry` より前に位置記録のタスク定義と起動時の後始末を import する（ADR-M-018）
│
├── src/
│   ├── components/            # 横断的に再利用するUI（機能に依存しない）
│   │   ├── ui/                #   Primitive: Button, Text, Card, Input ...（地図オーバーレイも含む）
│   │   ├── layout/            #   横断的な複合UI
│   │   └── <category>/        #   用途ごとのカテゴリ（例: location/, legal/, app-config/）
│   │
│   ├── features/              # 機能固有のまとまり（凝集の単位）
│   │   └── <feature>/         #   例: walk, history, pin
│   │       ├── components/    #     その機能でしか使わないUI
│   │       ├── hooks/         #     RN依存の副作用・状態（Vitest対象外）
│   │       ├── lib/           #     判定・整形などの純粋関数（Vitestでテスト）
│   │       ├── data/          #     静的データ（定数・選択肢一覧など）
│   │       ├── api/           #     その機能のAPI呼び出しラッパ
│   │       ├── store/         #     その機能に閉じたZustandストア
│   │       └── types.ts
│   │
│   ├── services/              # スタブ差し替えの層（認証・実機依存機能）
│   │   └── <service>/
│   │       ├── index.ts       #   環境変数で real/dev/mock を選択して export（既定 real）
│   │       ├── types.ts       #   インターフェース定義
│   │       ├── xxx.real.ts    #   本番実装
│   │       ├── xxx.dev.ts     #   本物に近いが実機/外部IdPに依存しない実装
│   │       └── xxx.mock.ts    #   テスト用の最小スタブ
│   │
│   ├── api/                   # Orval生成物 & 共通APIクライアント（customFetch・エラー・リトライ・QueryClient）
│   │   └── generated/         #   自動生成物（手編集禁止）
│   │
│   ├── hooks/                 # 横断的な汎用hook（機能非依存）
│   ├── lib/                   # 汎用ユーティリティ（純粋関数中心）・後始末レジストリ
│   ├── config/                # 環境変数の読み取り・定数
│   ├── store/                 # Zustand ストア（横断的なクライアント状態）
│   ├── theme/                 # デザイントークン・テーマ定義（StyleSheet + Context）
│   └── types/                 # 横断的な型定義
│
├── assets/                    # 画像・フォント等の静的アセット
├── .maestro/                  # E2Eテストフロー（Maestro）
│   └── subflows/              #   `runFlow` からのみ呼ばれる共通手順（単体では実行されない）
├── docs/                      # 設計ドキュメント
├── adr/                       # ADR（設計判断の記録）
├── app.json / app.config.ts   # Expo設定
├── tsconfig.json              # パスエイリアス @/ → src/
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
- `ui/`: Primitive（Button, Input, Card など）。どの機能にも依存しない最小単位。地図オーバーレイ（`MapPin`・`RoutePolyline` など）も `ui/` の1カテゴリとして扱う。
- `layout/` など: 横断的な複合UI。**最初から細分化せず、増えてきたらカテゴリ（サブフォルダ）を追加**する。
- **UI を持たない横断的な配線コンポーネント**も、ここのカテゴリに置く（例: `app-config/`）。
  機能固有の配線（`AuthGate` など）は `features/<feature>/components/` に置く。
- `ui/`・`layout/` 以外のカテゴリは用途（関係する機能・API）単位で切り、UI の有無で分けない
  （例: `app-config/` には `/app-config` の配線コンポーネントと、フラグで描画を出し分ける UI 付きの `FeatureGate` が同居する）。
  ファイルを足すときも「そのカテゴリの用途に関係するか」で判断する。

### `src/features/<feature>/` — 機能固有のまとまり
- 1つの機能に属する `components` / `hooks` / `lib` / `data` / `api` / `store` / `types` をこの配下に凝集させる。
- **`hooks/` は RN 依存の副作用・状態**（`useState`/`useEffect` など）を持つ層。Vitest ではレンダリング/フックのテストはできない
  （詳細は [pages-components-guideline](./pages-components-guideline.md)）。
- **判定・整形ロジックは `lib/` の純粋関数に切り出す**（`react-native` を値 import しない）。
  こちらが Vitest でのテスト対象になる（`.test.ts` を併置）。
- **`data/`** には静的データ・定数を置く。
  - サーバー由来データを代用する**暫定スタブ**は、API へ差し替わったら削除する一時的なものとして扱う。
  - **恒久的に残る静的データ**（API の enum の表示メタ・選択肢一覧・開発確認用の代表値・対応する API がまだ無い設定値など）は、残置理由を JSDoc に書く。
  - 画面の主データ（将来 API 化される可能性が高いもの）は `hooks/` 経由でのみ参照させ、View から `data/` を直接 import しない。
    フォールバック定数や開発用途の代表値のように実データ化の見込みが薄い値は、View からの直接 import を許容する。
- **`store/`** はその機能に閉じたクライアント状態（Zustand）。**サーバー由来のデータは置かない**
  （TanStack Query が保持する。二重管理を避けるため）。2つ以上の機能から参照されるようになったら `src/store/` へ昇格させる。
  - **いずれも永続化しない**（AsyncStorage / SecureStore を使わない）。
  - 「サーバー由来のデータを置かない」の例外は、サーバーが採番した識別子1つに限った `useFinishedWalkStore.savedWalkId` だけ
    （散歩の内容そのものは入れない）。例外を増やす場合は ADR で判断を残すこと。背景は [ADR-M-008](../adr/ADR-M-008-active-walk-state-and-route-cache.md)。
- **その機能の外から import されるものは置かない**（横断利用が必要になったら昇格させる。下記ルール参照）。
- **feature をまたいで画面を合成したいときは、`app/` のルートが render slot（props）で合成する**
  （例: ナビタブのルートが `features/walk` の画面へ `features/pin` の地図レイヤーや `features/history` の一覧を渡す）。
  feature 同士は互いに import しない。地図に重ねるレイヤーは `MapView` の子の末尾に置き、重なり順は `zIndex` で決める（ADR-M-012）。

### feature をまたぐイベントで他 feature の store をクリアしたくなったら
- 直接 import せず、`src/lib/` に**後始末レジストリ**を置き、クリアされる側が自分の後始末を登録する（ストアのファイル末尾で1回）。
  呼び出し側（イベントの発生源）は「何をクリアすべきか」を知らずに実行関数を1つ呼ぶだけにする。
  1つの後始末が例外を投げても他は止めない。
- 現在のレジストリは、サインアウト時（`sessionCleanup.ts`）と散歩の削除時（`walkDeletionCleanup.ts`）の2つ
  （[ADR-M-008](../adr/ADR-M-008-active-walk-state-and-route-cache.md) 決定6・決定8）。
- store 以外（端末に永続するキャッシュ・ファイル・OS のタスクなど）の後始末は、「未ロード = クリアすべきデータも無い」が成立しないため、
  表示するコンポーネントからではなく**起動時に必ず評価されるモジュール**（`app/_layout.tsx` か `index.ts`）から副作用 import する専用モジュールで登録する。

### コンポーネントの配置判断ルール（肥大化対策）
> **「2つ以上の機能から使うか？」**
> - Yes → `src/components/`（`ui/` もしくは適切なカテゴリ）
> - No → `src/features/<feature>/components/`
>
> 迷ったら **まず `features/` に置く**。再利用が実際に発生した時点で `components/` へ昇格させる。
> `components/` 直下にファイルを並べて肥大化させない。カテゴリのサブフォルダに分ける。

- 昇格の手順（`components/` / `src/lib/` / `src/hooks/` / `src/store/` 共通）: 移動先に同じ実装のファイルを作り（JSDoc に昇格の理由と元の場所を書く）→
  古いパスの import を `src/` と `app/` からすべて置き換え → `typecheck` と `test` が通ってから古いファイル（とその `.test.ts`）を消す。
  昇格は機能追加とは別のコミットにする（例: `refactor(mobile): xxx を src/lib へ昇格する`。差分を機械的に読めるようにするため）。

### `src/services/` — スタブ差し替えの層
- 認証(OAuth/OIDC)や実機依存機能（カメラ・位置情報など）を抽象化する層。
- 呼び出し側は `index.ts` が公開する**インターフェースのみ**を参照し、real/dev/mock の実体を知らない。
- 実装の選択は環境変数で切り替える（例: `EXPO_PUBLIC_AUTH_MODE`。`real` | `dev` | `mock`、既定 `real`）。
- `real` / `dev` / `mock` の3モードが基本形。`dev` は「本物に近いが実機/外部IdPに依存しない」実装、
  `mock` はユニットテスト向けの最小スタブという役割分担にする。
- ただし**必要なモードだけ用意してよい**（例: `services/location` は real/mock の2モード。[ADR-M-006](../adr/ADR-M-006-location-service-real-mock.md)）。
- テスト方針との対応:
  - **ユニットテスト**: `mock`（または個別モジュールへの直接フェイク注入）を利用する。
    `index.ts`（バレル）はネイティブ依存に到達しうるため、個別モジュールを直接 import するのが安全な場合がある
    （[architecture-guideline](./architecture-guideline.md)「テストの方針」）。
  - **E2Eテスト(Maestro)**: **Maestroで再現可能な機能は real のまま**利用し、再現できない機能は `dev` または `mock` にフォールバックする。

### `src/api/` — バックエンドAPIクライアント
- `generated/`: Orval による自動生成物。**手編集しない**。
- 直下には、機能に依存しないクライアントの土台（`customFetch`・`ApiError`・リトライ判定・送信ヘッダーの付与・`QueryClient` の設定）を置く。
  backend への HTTP 出口と横断的な送信ヘッダーの契約は [architecture-guideline](./architecture-guideline.md)「送信側のヘッダー契約」。
- 特定の機能に属さないアプリ基盤の取得（`/app-config`）のラッパもここに置く。**2本目の横断的エンドポイントラッパが増えたら
  `src/api/endpoints/` のようなサブフォルダへ分けること**（フラットに積み続けて肥大化させないため）。

### その他
- `src/hooks/`: 機能に依存しない汎用hook。`features/<feature>/hooks/` の hook が2つ以上の機能から使われるようになったら昇格させる。
- `src/lib/`: 純粋関数中心の汎用ユーティリティと、機能に依存しない小さな仕組み（後始末レジストリ・診断ログの出力口など）。
  `features/<feature>/lib/` の純粋関数が**2つ以上の機能から使われるようになったら `src/lib/` へ昇格**させる。
  汎用部分だけを昇格し、機能固有の計算は元の場所に残す（同名ファイルが2箇所にあってよい）。
  - 端末側の診断ログは `src/lib/diagnosticLog.ts` を唯一の出力口とし、**呼び出し側で `console.*` を直接使わない**。
- `src/config/`: 環境変数の読み取りと定数（ビルド variant の判定・フィーチャーフラグのキー・法的文書の URL など）。
- `src/store/`: Zustand による横断的なクライアント状態。**サーバー由来のデータは置かない**（それは TanStack Query が持つ）。UI状態や一時的なアプリ状態のみ。
  - 認証セッション（`useAuthSessionStore`）の `user` は、セッションと1:1で変わる identity snapshot として例外的に許容する。
    このストアは自分自身を後始末レジストリに登録しない（[ADR-M-009](../adr/ADR-M-009-auth-session-state-and-route-gate.md)）。
- `src/theme/`: デザイントークン（primitive / semantic）とテーマ定義。各コンポーネントは `makeStyles((theme) => ...)` でトークンを参照する
  （[ADR-M-005](../adr/ADR-M-005-styling-without-unistyles.md)・[ADR-M-016](../adr/ADR-M-016-theme-mode-preference.md)）。
- `src/types/`: 複数箇所で共有する横断的な型。

## 状態管理の使い分け

- **サーバー状態（API由来）= TanStack Query**。取得・キャッシュ・再検証はすべて Query に任せ、`src/store/` に複製しない。
  - ドメインのデータ取得hookは `src/features/<feature>/hooks/`（例: `useWalkHistory`）に置き、内部で Orval生成物 + TanStack Query を使う。
  - **更新系（mutation）も同じく `hooks/` に置く**（例: `useWalkSave`）。
    `useMutation` の発火・再試行方針・成功時の `invalidateQueries` をここに閉じ、View からは状態と再試行関数だけを見せる
    （認証など feature が直接見られない値は `app/` のルートから引数で注入する。`architecture-guideline.md`「認証の扱い」参照）。
  - **`features/<feature>/api/` には Orval が生成した「素の fetcher」を薄くラップした関数を置き、
    生成 hook（`useXxx...`）は使わない**。理由は2つ:
    1. queryKey / `enabled` / `retry` / `staleTime`（mutation なら再試行条件）を hooks 層で自前に制御したいため。
    2. 生成 hook は `react-native` を値 import する経路に乗るが、素の fetcher なら乗らないため
       **node 環境の Vitest でテストできる**（msw でレスポンスを差し替えて検証する）。
  - この層は `services/auth` を import しない（認証は `customFetch` が付ける）。対象の feature では `.oxlintrc.json` の
    `no-restricted-imports` で機械的に強制される（[ADR-M-009](../adr/ADR-M-009-auth-session-state-and-route-gate.md) 決定8）。
  - **`queryKey` はドメイン名で始める**（散歩記録なら `["walks", ...]`）。成功時の `invalidateQueries({ queryKey: ["walks"] })` で
    取得系の hook をまとめて再検証するため、別系統のキーだと保存直後の一覧が更新されない。
  - **カーソルページネーション（`useInfiniteQuery`）を使う一覧系 hook は、次の規約に従う**（実例: `useWalkHistory`）:
    - `getNextPageParam` は backend レスポンスの `next_cursor` をそのまま返す（`null` なら「次ページ無し」）。
    - **cursor に `null` を渡すクエリパラメータを直接組み立てない**。Orval 生成の URL ビルダーは `cursor: null` を
      リテラル文字列 `"null"` にしてしまい、backend が 400（Invalid cursor）を返す。`cursor` は「文字列かつ空文字でない」ときだけ
      キーを立てる純粋関数（例: `buildWalkListParams`）を通し、それ以外はキーごと作らない。
    - 先頭ページから読み直したいとき（`invalid_cursor` からの復旧・pull-to-refresh）は
      `refetch()` ではなく `resetQueries({ queryKey })` を使う。`refetch()` は同じ壊れたカーソルで再取得してしまう。
- **クライアント状態（UI・一時状態）= Zustand**。横断的なものだけ `src/store/`、機能限定のものは `src/features/<feature>/store/` に置く。
  - ただし**1画面に閉じる一時状態は store にせず `hooks/` の `useState` に留める**。画面をまたいで保持する必要が出た時点で store 化する。
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
